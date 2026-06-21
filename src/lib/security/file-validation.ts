import { getEnv } from "@/lib/env";

/**
 * Upload-Validierung VOR Speicherung/Verarbeitung.
 * Erlaubt nur PDF, JPG, PNG. Prüft Größe, Endung, MIME-Type und Magic-Bytes,
 * damit eine umbenannte/getarnte Datei nicht in die Pipeline gelangt.
 */
export type AllowedKind = "pdf" | "jpg" | "png";

const EXT_TO_KIND: Record<string, AllowedKind> = {
  pdf: "pdf",
  jpg: "jpg",
  jpeg: "jpg",
  png: "png",
};

const MIME_TO_KIND: Record<string, AllowedKind> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

export interface FileValidationInput {
  filename: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

export interface FileValidationResult {
  ok: boolean;
  kind?: AllowedKind;
  /** Verständliche, datenarme Fehlermeldung (kunden-/vermittlertauglich). */
  error?: string;
}

function detectMagicKind(buf: Buffer): AllowedKind | null {
  if (buf.length < 4) return null;
  // PDF: "%PDF"
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf";
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }
  return null;
}

export function validateUpload(input: FileValidationInput): FileValidationResult {
  const maxBytes = getEnv().UPLOAD_MAX_MB * 1024 * 1024;
  if (input.size <= 0) return { ok: false, error: "Die Datei ist leer." };
  if (input.size > maxBytes) {
    return { ok: false, error: `Die Datei ist zu groß (max. ${getEnv().UPLOAD_MAX_MB} MB).` };
  }

  const ext = input.filename.split(".").pop()?.toLowerCase() ?? "";
  const extKind = EXT_TO_KIND[ext];
  if (!extKind) {
    return { ok: false, error: "Nur PDF, JPG oder PNG sind erlaubt." };
  }

  const mimeKind = MIME_TO_KIND[input.mimeType.toLowerCase()];
  // MIME darf fehlen (manche Browser senden octet-stream), aber wenn vorhanden,
  // muss er zur Endung passen.
  if (mimeKind && mimeKind !== extKind) {
    return { ok: false, error: "Dateityp und Inhalt passen nicht zusammen." };
  }

  const magicKind = detectMagicKind(input.buffer);
  if (!magicKind) {
    return { ok: false, error: "Die Datei konnte nicht als PDF/JPG/PNG erkannt werden." };
  }
  if (magicKind !== extKind) {
    return { ok: false, error: "Der Dateiinhalt entspricht nicht der Endung." };
  }

  return { ok: true, kind: magicKind };
}
