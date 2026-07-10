import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { getStorage, type StoredObject } from "@/lib/storage";
import { getOCRProvider } from "@/lib/ai";
import { AIService } from "@/lib/ai/service";
import { generateFileName } from "@/lib/documents/filename";
import { validateUpload } from "@/lib/security/file-validation";
import { normalizeUploadFile } from "@/lib/documents/heic";
import { getVirusScanner } from "@/lib/security/virus-scan";
import type { DocumentScanStatus, UploadSource } from "@/lib/domain/enums";

/**
 * Sichere Upload-Pipeline:
 *   validieren → speichern → Virenscan (Quarantäne) → erst danach OCR/KI.
 * Jeder Schritt wird auditiert (nur Metadaten, keine Klartext-Inhalte).
 */
const ai = new AIService();

export interface ProcessUploadFile {
  name: string;
  type: string;
  size: number;
  buffer: Buffer;
}

export interface ProcessUploadInput {
  organizationId: string;
  caseId: string;
  file: ProcessUploadFile;
  uploadSource: UploadSource;
  applicantName?: string | null;
  applicantId?: string | null;
  actorUserId?: string | null;
}

export interface ProcessUploadResult {
  ok: boolean;
  documentId?: string;
  fileName: string;
  scanStatus?: DocumentScanStatus;
  /** Datenarme, verständliche Meldung bei Ablehnung/Quarantäne. */
  reason?: string;
}

export async function processUpload(input: ProcessUploadInput): Promise<ProcessUploadResult> {
  const { organizationId, caseId, uploadSource } = input;

  // 0) HEIC/HEIF (iPhone-Standard) serverseitig nach JPEG konvertieren, bevor
  //    validiert/gespeichert/ge-OCRt wird.
  const { file } = await normalizeUploadFile(input.file);

  // 1) Validierung (Typ/Größe/MIME/Magic-Bytes) VOR Speicherung.
  const validation = validateUpload({
    filename: file.name,
    mimeType: file.type,
    size: file.size,
    buffer: file.buffer,
  });
  if (!validation.ok) {
    await audit({
      organizationId,
      userId: input.actorUserId ?? null,
      action: "document.rejected",
      entityType: "case",
      entityId: caseId,
      metadata: { source: uploadSource, reason: validation.error, stage: "validation" },
    });
    return { ok: false, fileName: file.name, reason: validation.error };
  }

  // 2) Speichern (mandanten-/fallbezogener Pfad).
  //    MIME-Type stammt aus den Magic-Bytes (kanonisch) – nie vom Client.
  const stored = await getStorage().put({
    organizationId,
    caseId,
    originalName: file.name,
    mimeType: validation.mimeType!,
    buffer: file.buffer,
  });

  return runPipelineAfterStore({
    organizationId,
    caseId,
    uploadSource,
    applicantName: input.applicantName,
    applicantId: input.applicantId,
    actorUserId: input.actorUserId,
    originalName: file.name,
    buffer: file.buffer,
    stored,
  });
}

export interface ProcessStoredUploadInput {
  organizationId: string;
  caseId: string;
  /** Kanonischer Objektpfad der bereits (per Direkt-Upload) gespeicherten Datei. */
  storageKey: string;
  originalName: string;
  /** Vom Client deklarierter MIME-Type (nur Hinweis; kanonisch zählen Magic-Bytes). */
  mimeType?: string;
  uploadSource: UploadSource;
  applicantName?: string | null;
  applicantId?: string | null;
  actorUserId?: string | null;
}

/**
 * Verarbeitet eine bereits per Browser-Direkt-Upload in den Storage gelegte Datei
 * (umgeht das Function-Body-Limit für große Dateien, v.a. PDFs). Lädt die Bytes
 * zur Validierung/Scan aus dem Storage, danach identische Pipeline wie processUpload.
 */
export async function processStoredUpload(input: ProcessStoredUploadInput): Promise<ProcessUploadResult> {
  const { organizationId, caseId, uploadSource } = input;
  const storage = getStorage();

  const buffer = await storage.get(input.storageKey);
  if (!buffer) {
    return { ok: false, fileName: input.originalName, reason: "Datei nicht auffindbar (Upload unvollständig). Bitte erneut versuchen." };
  }

  // Validierung NACH Direkt-Upload (Endung/Größe/MIME/Magic-Bytes). Bei Ungültigkeit
  // das hochgeladene Objekt wieder entfernen (kein verwaistes Objekt im Bucket).
  const validation = validateUpload({
    filename: input.originalName,
    mimeType: input.mimeType ?? "",
    size: buffer.byteLength,
    buffer,
  });
  if (!validation.ok) {
    await storage.remove(input.storageKey).catch(() => {});
    await audit({
      organizationId,
      userId: input.actorUserId ?? null,
      action: "document.rejected",
      entityType: "case",
      entityId: caseId,
      metadata: { source: uploadSource, reason: validation.error, stage: "validation", direct: true },
    });
    return { ok: false, fileName: input.originalName, reason: validation.error };
  }

  return runPipelineAfterStore({
    organizationId,
    caseId,
    uploadSource,
    applicantName: input.applicantName,
    applicantId: input.applicantId,
    actorUserId: input.actorUserId,
    originalName: input.originalName,
    buffer,
    stored: { storageKey: input.storageKey, mimeType: validation.mimeType!, sizeBytes: buffer.byteLength },
  });
}

interface AfterStoreInput {
  organizationId: string;
  caseId: string;
  uploadSource: UploadSource;
  applicantName?: string | null;
  applicantId?: string | null;
  actorUserId?: string | null;
  originalName: string;
  buffer: Buffer;
  stored: StoredObject;
}

/**
 * Gemeinsamer Pipeline-Teil ab „Datei liegt im Storage": Dokument anlegen
 * (Quarantäne) → Virenscan → OCR + KI. Wird von processUpload und
 * processStoredUpload genutzt.
 */
async function runPipelineAfterStore(input: AfterStoreInput): Promise<ProcessUploadResult> {
  const { organizationId, caseId, uploadSource, originalName, buffer, stored } = input;
  const storage = getStorage();

  // 3) Dokument anlegen, zunächst in Quarantäne (Scan ausstehend).
  const doc = await prisma.document.create({
    data: {
      caseId,
      applicantId: input.applicantId ?? undefined,
      originalName,
      generatedName: generateFileName({
        documentType: null,
        applicantName: input.applicantName ?? null,
        originalName,
      }),
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      uploadSource,
      scanStatus: "virus_scan_pending",
    },
    select: { id: true },
  });

  // 4) Virenscan.
  const scanner = getVirusScanner();
  let scan;
  try {
    scan = await scanner.scan({ buffer, filename: originalName, mimeType: stored.mimeType });
  } catch {
    scan = { verdict: "error" as const, engine: scanner.name, demo: false };
  }

  await audit({
    organizationId,
    userId: input.actorUserId ?? null,
    action: "document.scanned",
    entityType: "document",
    entityId: doc.id,
    metadata: { engine: scan.engine, verdict: scan.verdict, demo: scan.demo },
  });

  if (scan.verdict === "infected") {
    await prisma.document.update({
      where: { id: doc.id },
      data: { scanStatus: "rejected", scanEngine: scan.engine, scannedAt: new Date(), readable: false },
    });
    // Infizierte Datei aus dem Storage entfernen (keine weitere Verarbeitung).
    // Der Upload gilt trotzdem als abgelehnt; ein Fehlschlag darf ihn nicht
    // durchgehen lassen, muss aber sichtbar sein (Datei liegt dann noch im Bucket).
    await storage.remove(stored.storageKey).catch((e) => {
      console.error(`[pipeline] Infizierte Datei ${stored.storageKey} nicht entfernt:`, e);
    });
    await audit({
      organizationId,
      userId: input.actorUserId ?? null,
      action: "document.rejected",
      entityType: "document",
      entityId: doc.id,
      metadata: { reason: "virus", signature: scan.signature, stage: "scan" },
    });
    return {
      ok: false,
      documentId: doc.id,
      fileName: originalName,
      scanStatus: "rejected",
      reason: "Aus Sicherheitsgründen abgelehnt (Schadsoftware erkannt).",
    };
  }

  if (scan.verdict === "error") {
    await prisma.document.update({
      where: { id: doc.id },
      data: { scanStatus: "virus_scan_failed", scanEngine: scan.engine, scannedAt: new Date() },
    });
    return {
      ok: false,
      documentId: doc.id,
      fileName: originalName,
      scanStatus: "virus_scan_failed",
      reason: "Sicherheitsprüfung derzeit nicht möglich. Die Datei wurde sicher zwischengelagert und wird geprüft.",
    };
  }

  // Sauber → für OCR freigegeben.
  await prisma.document.update({
    where: { id: doc.id },
    data: { scanStatus: "ready_for_ocr", scanEngine: scan.engine, scannedAt: new Date() },
  });

  // 5) OCR + KI (best effort; Ausfall blockiert den Upload nicht).
  const ocr = getOCRProvider();
  let ocrResult: Awaited<ReturnType<typeof ocr.extractText>> | null = null;
  let cls: Awaited<ReturnType<typeof ai.classifyDocument>> | null = null;
  let ext: Awaited<ReturnType<typeof ai.extractFields>> | null = null;
  try {
    ocrResult = await ocr.extractText({
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      originalName,
      buffer,
    });
    cls = await ai.classifyDocument(ocrResult.fullText, { pageCount: ocrResult.pageCount });
    ext = await ai.extractFields(cls.documentType, ocrResult.fullText);
  } catch {
    // KI/OCR nicht verfügbar – ohne Klartext loggen.
  }

  const generatedName = generateFileName({
    documentType: cls?.documentType ?? null,
    applicantName: cls?.detectedApplicant ?? input.applicantName ?? null,
    propertyRef: cls?.detectedPropertyRef,
    period: cls?.period,
    originalName,
  });

  await prisma.document.update({
    where: { id: doc.id },
    data: {
      generatedName,
      pageCount: ocrResult?.pageCount,
      documentType: cls?.documentType ?? null,
      ocrStatus: ocrResult ? "fertig" : "fehler",
      classificationStatus: cls ? "fertig" : "fehler",
      extractionStatus: ext ? "fertig" : "fehler",
      confidence: cls?.confidence,
      readable: ocrResult ? true : null,
      period: cls?.period ?? undefined,
      pages: ocrResult
        ? { create: ocrResult.pages.map((p) => ({ pageNumber: p.pageNumber, ocrText: p.text, width: p.width, height: p.height })) }
        : undefined,
      extractedFields: ext
        ? {
            create: ext.fields.map((f) => ({
              key: f.key,
              label: f.label,
              value: f.value == null ? null : String(f.value),
              confidence: f.confidence,
              source: f.source,
            })),
          }
        : undefined,
      warnings: ext
        ? { create: ext.warnings.map((w) => ({ code: w.code, severity: w.severity, message: w.message, customerVisible: w.customerVisible })) }
        : undefined,
    },
  });

  return { ok: true, documentId: doc.id, fileName: originalName, scanStatus: "ready_for_ocr" };
}

/** Maximale Upload-Größe in MB (für UI-Hinweise). */
export function maxUploadMb(): number {
  return getEnv().UPLOAD_MAX_MB;
}
