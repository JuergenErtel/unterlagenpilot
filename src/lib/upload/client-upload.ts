/**
 * Client-seitiger Sammel-Upload.
 *
 * Lädt Dateien EINZELN nacheinander hoch (ein Request pro Datei), damit kein
 * Request das Plattform-Body-Limit sprengt (Vercel deckelt Function-Requests –
 * viele Dateien in einem Request schlagen sonst komplett fehl). Bilder werden
 * vor dem Senden verkleinert; das hält auch einzelne große Handyfotos unter dem
 * Limit und beschleunigt OCR. PDFs und HEIC/HEIF bleiben unangetastet (HEIC kann
 * der Browser nicht dekodieren – die Server-Pipeline konvertiert es).
 */

export interface UploadOutcome {
  uploaded: number;
  rejected: { name: string; reason: string }[];
  error?: string;
}

export interface UploadProgress {
  done: number;
  total: number;
  current?: string;
}

/** Ergebnis eines Einzel-Datei-Server-Calls. */
type UploadOneResult = { uploaded: number; rejected: { name: string; reason: string }[]; error?: string };

const MAX_IMAGE_EDGE = 2200; // px – reicht für lesbare OCR, deutlich kleiner als Originale
const IMAGE_QUALITY = 0.82;
const COMPRESS_ABOVE_BYTES = 1_500_000; // kleine Bilder nicht unnötig neu kodieren

/** Verkleinert JPEG/PNG clientseitig; alle anderen Typen unverändert zurück. */
async function prepareFile(file: File): Promise<File> {
  if (!/^image\/(jpeg|png)$/i.test(file.type)) return file;
  if (file.size < COMPRESS_ABOVE_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", IMAGE_QUALITY));
    if (!blob || blob.size >= file.size) return file; // kein Gewinn → Original behalten
    const name = file.name.replace(/\.(png|jpe?g)$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file; // im Zweifel Original senden
  }
}

export interface SequentialUploadOptions {
  /** Zusätzliche FormData-Felder pro Datei (z.B. applicantPosition). */
  extraFields?: Record<string, string>;
  onProgress?: (p: UploadProgress) => void;
}

/**
 * Lädt `files` einzeln über `uploadOne` hoch und aggregiert das Ergebnis.
 * `uploadOne` erhält ein FormData mit genau einer Datei (Feld "files") plus
 * `extraFields` und liefert das Ergebnis dieser einen Datei zurück.
 */
export async function uploadFilesSequentially(
  files: File[],
  uploadOne: (formData: FormData) => Promise<UploadOneResult>,
  options: SequentialUploadOptions = {}
): Promise<UploadOutcome> {
  const rejected: { name: string; reason: string }[] = [];
  let uploaded = 0;

  for (let i = 0; i < files.length; i++) {
    const original = files[i]!;
    options.onProgress?.({ done: i, total: files.length, current: original.name });
    const prepared = await prepareFile(original);

    const fd = new FormData();
    for (const [k, v] of Object.entries(options.extraFields ?? {})) fd.append(k, v);
    fd.append("files", prepared, prepared.name);

    try {
      const res = await uploadOne(fd);
      if (res.error) {
        rejected.push({ name: original.name, reason: res.error });
      } else {
        uploaded += res.uploaded;
        rejected.push(...res.rejected);
      }
    } catch {
      rejected.push({
        name: original.name,
        reason: "Übertragung fehlgeschlagen – Datei evtl. zu groß. Bitte einzeln erneut versuchen.",
      });
    }
  }

  options.onProgress?.({ done: files.length, total: files.length });
  return { uploaded, rejected };
}
