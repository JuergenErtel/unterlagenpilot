/**
 * HEIC/HEIF-Erkennung + Serverkonvertierung nach JPEG.
 * iPhone-Fotos sind standardmäßig HEIC; Browser/PDF-Pipeline können damit nichts
 * anfangen. Wir konvertieren solche Uploads serverseitig zu JPEG, bevor sie
 * validiert, gespeichert und ge-OCRt werden.
 */

// HEIC/HEIF sind ISO-BMFF-Dateien mit einer "ftyp"-Box; der Major-Brand steht
// direkt danach (Bytes 8–12).
const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);

export function isHeic(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.toString("latin1", 4, 8) !== "ftyp") return false;
  return HEIC_BRANDS.has(buf.toString("latin1", 8, 12));
}

/** Konvertiert einen HEIC/HEIF-Puffer nach JPEG. */
export async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  // Dynamischer Import: das (wasm-)Paket wird nur geladen, wenn wirklich HEIC kommt.
  const convert = (await import("heic-convert")).default;
  const out = await convert({ buffer, format: "JPEG", quality: 0.85 });
  return Buffer.from(out);
}

export interface UploadFile {
  name: string;
  type: string;
  size: number;
  buffer: Buffer;
}

/**
 * Normalisiert eine Upload-Datei: ist sie HEIC/HEIF, wird sie nach JPEG
 * konvertiert (Name → .jpg, Typ → image/jpeg). Schlägt die Konvertierung fehl,
 * bleibt die Datei unverändert (die spätere Validierung lehnt sie dann sauber ab).
 */
export async function normalizeUploadFile(file: UploadFile): Promise<{ file: UploadFile; converted: boolean }> {
  if (!isHeic(file.buffer)) return { file, converted: false };
  try {
    const jpeg = await convertHeicToJpeg(file.buffer);
    const base = file.name.replace(/\.(heic|heif)$/i, "");
    const name = `${base === file.name ? file.name : base}.jpg`;
    return { file: { name, type: "image/jpeg", size: jpeg.length, buffer: jpeg }, converted: true };
  } catch (e) {
    console.error(`[upload] HEIC-Konvertierung fehlgeschlagen für "${file.name}":`, e);
    return { file, converted: false };
  }
}
