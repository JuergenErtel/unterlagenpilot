import { after } from "next/server";
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
import { hatTextgrundlage } from "./textsubstanz";
import { matchApplicant } from "@/lib/documents/applicant-match";
import { runReferenceExtraction, reconcileCase } from "@/lib/detektiv/service";
import { erkenneAufteilung } from "@/lib/aufteilung/service";
import { starteBuendelLaufWennFertig } from "@/lib/buendelung/service";
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
      applicantSource: input.applicantId ? "manuell" : undefined,
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

  // Sauber → für OCR freigegeben. Marker "läuft", damit die UI zwischen
  // "wird noch analysiert" und einem echten Fehler unterscheiden kann.
  await prisma.document.update({
    where: { id: doc.id },
    data: {
      scanStatus: "ready_for_ocr",
      scanEngine: scan.engine,
      scannedAt: new Date(),
      ocrStatus: "laeuft",
      classificationStatus: "laeuft",
      extractionStatus: "laeuft",
    },
  });

  // 5) OCR + KI laufen NACH der Antwort im Hintergrund (after()). Früher blockierten
  //    OCR + 2 LLM-Calls je Datei den Upload-Request – das ließ den Upload
  //    "unendlich" wirken. Jetzt kehrt der Upload sofort zurück; die Analyse füllt
  //    Typ/Felder wenige Sekunden später nach.
  after(() =>
    processOcrAndAi({
      documentId: doc.id,
      caseId,
      applicantId: input.applicantId ?? null,
      buffer,
      stored,
      originalName,
      applicantName: input.applicantName ?? null,
    })
  );

  return { ok: true, documentId: doc.id, fileName: originalName, scanStatus: "ready_for_ocr" };
}

interface OcrAndAiInput {
  documentId: string;
  caseId: string;
  /** Bereits bewusst gesetzte Zuordnung – dann findet kein Abgleich statt. */
  applicantId: string | null;
  buffer: Buffer;
  stored: StoredObject;
  originalName: string;
  applicantName: string | null;
}

/**
 * OCR + Klassifikation + Feld-Extraktion für ein bereits gespeichertes, sauberes
 * Dokument. Läuft im Hintergrund (after()) und aktualisiert den Datensatz, sobald
 * fertig. Ein Ausfall blockiert nichts – das Dokument wird als Fehler markiert und
 * kann per "KI-Prüfung starten" erneut verarbeitet werden.
 */
async function processOcrAndAi(input: OcrAndAiInput): Promise<void> {
  const { documentId, caseId, buffer, stored, originalName, applicantName } = input;
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
    // Ohne Textgrundlage NICHT einstufen. Das Klassifikationsschema verlangt
    // einen Typ, also erfindet das Modell einen und zeigt sich seiner sicher –
    // genau so wurde aus einem Ausweis-Scan ein "Grundbuchauszug" mit
    // Konfidenz 0,98, und die Checkliste meldete Gruen fuer ein Dokument, das
    // im Fall gar nicht lag. Lieber kein Typ als ein erfundener: Ein fehlendes
    // Dokument sieht man, ein falsches Gruen nicht.
    if (hatTextgrundlage(ocrResult.fullText)) {
      cls = await ai.classifyDocument(ocrResult.fullText, {
        pageCount: ocrResult.pageCount,
        originalName,
      });
      ext = await ai.extractFields(cls.documentType, ocrResult.fullText);
    }
  } catch {
    // KI/OCR nicht verfügbar – ohne Klartext loggen.
  }

  // Eine Datei ohne erkannten Text ist maschinell nicht lesbar. Das Merkmal
  // haelt sie aus der Erfuellung von Checklistenpositionen heraus
  // (`evaluateMatches` zaehlt nur `readable !== false`) – auch dann, wenn ihr
  // spaeter doch ein Typ zugewiesen wuerde.
  const lesbar = ocrResult ? hatTextgrundlage(ocrResult.fullText) : null;

  // Antragsteller automatisch zuordnen, sofern der Vermittler nicht selbst
  // gewählt hat. Bei genau einem Antragsteller ist die Zuordnung trivial, bei
  // mehreren entscheidet der im Dokument erkannte Name (Vor- UND Nachname).
  // Best-effort: ein Fehler hier darf die Analyse nicht kippen.
  let autoApplicantId: string | null = null;
  let autoApplicantName: string | null = null;
  if (!input.applicantId) {
    try {
      const applicants = await prisma.applicant.findMany({
        where: { caseId },
        orderBy: { position: "asc" },
        select: { id: true, position: true, vorname: true, nachname: true },
      });
      autoApplicantId = matchApplicant(cls?.detectedApplicant, applicants);
      const hit = applicants.find((a) => a.id === autoApplicantId);
      autoApplicantName = hit ? [hit.vorname, hit.nachname].filter(Boolean).join(" ") || null : null;
    } catch (e) {
      console.error(`[pipeline] Antragsteller-Zuordnung für Dokument ${documentId} fehlgeschlagen:`, e);
    }
  }

  const generatedName = generateFileName({
    documentType: cls?.documentType ?? null,
    applicantName: autoApplicantName ?? cls?.detectedApplicant ?? applicantName ?? null,
    propertyRef: cls?.detectedPropertyRef,
    period: cls?.period,
    originalName,
  });

  try {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        generatedName,
        pageCount: ocrResult?.pageCount,
        documentType: cls?.documentType ?? null,
        detectedApplicant: cls?.detectedApplicant ?? null,
        ...(autoApplicantId ? { applicantId: autoApplicantId, applicantSource: "auto" } : {}),
        ocrStatus: ocrResult ? "fertig" : "fehler",
        // Ohne Textgrundlage ist die Einstufung nicht gescheitert, sondern
        // bewusst unterblieben: "fertig" ohne Typ. "fehler" wuerde zum
        // Wiederholen einladen, und ein zweiter Lauf faende genauso wenig Text.
        classificationStatus: cls || lesbar === false ? "fertig" : "fehler",
        extractionStatus: ext || lesbar === false ? "fertig" : "fehler",
        confidence: cls?.confidence,
        readable: lesbar,
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
  } catch (e) {
    console.error(`[pipeline] Hintergrund-Analyse für Dokument ${documentId} fehlgeschlagen:`, e);
  }

  // Unterlagen-Detektiv ZULETZT und gekapselt: erst die Verweise dieses
  // Dokuments lesen, dann den ganzen Fall neu abgleichen (damit ein frueher
  // gemeldeter Befund sich schliesst, wenn die Urkunde jetzt dabei war).
  // Faellt das aus, bleibt die Dokumentanalyse unberuehrt – sichtbar wird der
  // Ausfall ueber referenceStatus.
  try {
    // Aufteilungserkennung ZUERST: wird gleich darauf aufgetrennt, prueft der
    // Detektiv ohnehin jedes Teildokument neu – seine Arbeit am Sammel-PDF
    // waere sonst umsonst.
    await erkenneAufteilung(documentId);
    await runReferenceExtraction(documentId);
    await reconcileCase(caseId);
  } catch (e) {
    console.error(`[pipeline] Nachlauf für Dokument ${documentId} fehlgeschlagen:`, e);
  }

  // ZULETZT und in einer EIGENEN try/catch-Grenze: Die Buendelung fragt den
  // ganzen Fall ab und braucht deshalb alle anderen Analysen fertig. Sie
  // startet nur, wenn dieses Dokument das letzte laufende war. Ein eigener
  // Block, weil `reconcileCase` oben - anders als `erkenneAufteilung` und
  // `runReferenceExtraction` - NICHT intern abgesichert ist: wuerfe es, faengt
  // das der Block darueber ab und der Anstoss unten wuerde sonst mitgerissen
  // - der Fall bliebe fuer immer auf "ausstehend" stehen, ohne dass irgendwo
  // ein Fehler sichtbar wird.
  try {
    await starteBuendelLaufWennFertig(caseId, documentId);
  } catch (e) {
    console.error(`[pipeline] Buendel-Anstoss fuer Dokument ${documentId} fehlgeschlagen:`, e);
  }
}

/**
 * Startet die Analyse (OCR, Klassifizierung, Extraktion, Nachlauf) fuer ein
 * bereits gespeichertes Dokument. Wird vom Auftrennen fuer jedes Teildokument
 * aufgerufen – die Teile sollen dieselbe Behandlung bekommen wie ein normaler
 * Upload.
 */
export async function analysiereDokument(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      caseId: true,
      applicantId: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      originalName: true,
    },
  });
  if (!doc) return;

  const buffer = await getStorage().get(doc.storageKey);
  if (!buffer) {
    console.error(`[pipeline] Datei zu Dokument ${documentId} nicht auffindbar`);
    return;
  }

  await processOcrAndAi({
    documentId: doc.id,
    caseId: doc.caseId,
    applicantId: doc.applicantId,
    buffer,
    stored: { storageKey: doc.storageKey, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes },
    originalName: doc.originalName,
    applicantName: null,
  });
}

/** Maximale Upload-Größe in MB (für UI-Hinweise). */
export function maxUploadMb(): number {
  return getEnv().UPLOAD_MAX_MB;
}
