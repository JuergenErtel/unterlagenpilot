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

/** Signierte Upload-URL oder Fehler (vom Server). */
type SlotResult = { uploadUrl: string; storageKey: string } | { error: string };

/** Metadaten, die nach dem Direkt-Upload an die Verarbeitungs-Action gehen. */
export interface StoredUploadMeta {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

const MAX_IMAGE_EDGE = 2200; // px – reicht für lesbare OCR, deutlich kleiner als Originale
const IMAGE_QUALITY = 0.82;
const COMPRESS_ABOVE_BYTES = 1_500_000; // kleine Bilder nicht unnötig neu kodieren
// Ab dieser Größe geht die Datei per Direkt-Upload zum Storage (an der Serverless-
// Function vorbei) – Vercel deckelt Function-Requests bei ~4,5 MB. Sicherheitsabstand.
const DIRECT_UPLOAD_ABOVE_BYTES = 3_500_000;

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
  /**
   * Direkt-Upload für große Dateien (>3,5 MB), umgeht das Function-Body-Limit.
   * Beide Callbacks müssen gesetzt sein, sonst läuft alles über `uploadOne`.
   */
  requestSlot?: (originalName: string, mimeType: string) => Promise<SlotResult>;
  processStored?: (meta: StoredUploadMeta) => Promise<UploadOneResult>;
}

/**
 * Lädt eine große Datei direkt zum Supabase-Storage (signierte URL) und stößt danach
 * die Verarbeitung an. Der PUT + FormData-Aufbau entspricht exakt dem, was
 * `@supabase/storage-js` `uploadToSignedUrl` für einen Blob tut (Feldname "",
 * `cacheControl`, kein eigener content-type – Multipart-Boundary setzt der Browser).
 */
async function uploadViaDirect(
  file: File,
  requestSlot: NonNullable<SequentialUploadOptions["requestSlot"]>,
  processStored: NonNullable<SequentialUploadOptions["processStored"]>
): Promise<UploadOneResult> {
  const mimeType = file.type || "application/octet-stream";
  const slot = await requestSlot(file.name, mimeType);
  if ("error" in slot) return { uploaded: 0, rejected: [], error: slot.error };

  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file, file.name);

  const put = await fetch(slot.uploadUrl, {
    method: "PUT",
    headers: { "x-upsert": "false" },
    body: form,
  });
  if (!put.ok) {
    return { uploaded: 0, rejected: [{ name: file.name, reason: `Direkt-Upload fehlgeschlagen (${put.status}).` }] };
  }

  return processStored({ storageKey: slot.storageKey, originalName: file.name, mimeType, sizeBytes: file.size });
}

/**
 * Lädt `files` einzeln hoch und aggregiert das Ergebnis. Kleine Dateien gehen über
 * `uploadOne` (Server-Action mit FormData), große über den Direkt-Upload (falls
 * `requestSlot`/`processStored` gesetzt), damit das Body-Limit nie greift.
 */
export async function uploadFilesSequentially(
  files: File[],
  uploadOne: (formData: FormData) => Promise<UploadOneResult>,
  options: SequentialUploadOptions = {}
): Promise<UploadOutcome> {
  const rejected: { name: string; reason: string }[] = [];
  let uploaded = 0;
  const canDirect = Boolean(options.requestSlot && options.processStored);

  for (let i = 0; i < files.length; i++) {
    const original = files[i]!;
    options.onProgress?.({ done: i, total: files.length, current: original.name });
    const prepared = await prepareFile(original);

    try {
      let res: UploadOneResult;
      if (canDirect && prepared.size > DIRECT_UPLOAD_ABOVE_BYTES) {
        res = await uploadViaDirect(prepared, options.requestSlot!, options.processStored!);
      } else {
        const fd = new FormData();
        for (const [k, v] of Object.entries(options.extraFields ?? {})) fd.append(k, v);
        fd.append("files", prepared, prepared.name);
        res = await uploadOne(fd);
      }
      if (res.error) {
        rejected.push({ name: original.name, reason: res.error });
      } else {
        uploaded += res.uploaded;
        rejected.push(...res.rejected);
      }
    } catch {
      rejected.push({
        name: original.name,
        reason: "Übertragung fehlgeschlagen – bitte diese Datei einzeln erneut versuchen.",
      });
    }
  }

  options.onProgress?.({ done: files.length, total: files.length });
  return { uploaded, rejected };
}
