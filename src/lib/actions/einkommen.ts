// src/lib/actions/einkommen.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getEnv } from "@/lib/env";
import { processUpload, processStoredUpload } from "@/lib/documents/pipeline";
import { getStorage, isStorageKeyForCase } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { AIService } from "@/lib/ai/service";
import { consolidateEinkommen, KENNZAHL_LABELS, type ConsolidatedMatrix } from "@/lib/einkommen/consolidate";
import { toEinkommenDocs } from "@/lib/einkommen/schema";
import { renderEinkommensanalyse } from "@/lib/pdf/renderer";
import { getBrokerInfo, pdfFileName } from "@/lib/pdf/case-pdf";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/domain/enums";

const ai = new AIService();
const VISION_MIME = new Set(["image/png", "image/jpeg"]);

export interface EinkommenState {
  matrix: ConsolidatedMatrix | null;
  docNotes: Array<{ label: string; notiz: string }>;
  error?: string;
}

export async function analyzeSelfEmployedAction(
  caseId: string,
  _prev: EinkommenState,
  formData: FormData
): Promise<EinkommenState> {
  const { ctx } = await requireCaseAccess(caseId);

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { matrix: null, docNotes: [], error: "Bitte mindestens eine Unterlage hochladen." };

  const images: Array<{ base64: string; mimeType: string }> = [];
  const documents: Array<{ url: string; name?: string }> = [];
  const storage = getStorage();
  let skipped = 0;
  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await processUpload({
        organizationId: ctx.organizationId,
        caseId,
        file: { name: file.name, type: file.type, size: file.size, buffer },
        uploadSource: "vermittler",
        actorUserId: ctx.userId,
      });
      if (!result.ok || !result.documentId) {
        skipped++;
        console.warn(`[einkommen] Upload übersprungen "${file.name}": ${result.reason ?? "nicht verarbeitbar"}`);
        continue;
      }
      if (VISION_MIME.has(file.type)) {
        images.push({ base64: buffer.toString("base64"), mimeType: file.type });
      } else if (file.type === "application/pdf") {
        const d = await prisma.document.findUnique({ where: { id: result.documentId }, select: { storageKey: true } });
        const signed = d ? await storage.createSignedUrl(d.storageKey, 300) : null;
        if (signed) {
          documents.push({ url: signed, name: file.name });
        } else {
          skipped++;
          console.warn(`[einkommen] Keine signierte URL für PDF "${file.name}" (Storage: ${storage.constructor.name}).`);
        }
      } else {
        skipped++;
        console.warn(`[einkommen] Dateityp nicht für KI-Analyse geeignet: "${file.name}" (${file.type}).`);
      }
    } catch (e) {
      // Eine fehlerhafte Datei darf nicht die gesamte Analyse blockieren (sonst: leere Seite).
      skipped++;
      console.error(`[einkommen] Verarbeitung von "${file.name}" fehlgeschlagen:`, e);
    }
  }

  if (images.length === 0 && documents.length === 0) {
    return {
      matrix: null,
      docNotes: [],
      error:
        skipped > 0
          ? "Die hochgeladenen Unterlagen konnten nicht für die KI-Analyse vorbereitet werden (Format/Speicherung). Bitte als gut lesbares PDF oder Foto (JPG/PNG) erneut hochladen."
          : "Für die KI-Analyse bitte JPG/PNG- oder PDF-Unterlagen hochladen.",
    };
  }

  let matrix: ConsolidatedMatrix | null = null;
  let docNotes: Array<{ label: string; notiz: string }> = [];
  try {
    const analysis = await ai.analyzeSelfEmployedDocs(images, documents);
    const docs = toEinkommenDocs(analysis);
    matrix = consolidateEinkommen(docs);
    docNotes = docs
      .filter((d) => d.notiz.trim().length > 0)
      .map((d) => ({
        label: `${DOCUMENT_TYPE_LABELS[d.dokumenttyp as DocumentType] ?? d.dokumenttyp} ${d.jahr}`,
        notiz: d.notiz,
      }));
  } catch (e) {
    // Echten Fehler protokollieren (Server-Log/Vercel), aber dem Nutzer keine Interna zeigen.
    console.error("[einkommen] KI-Analyse fehlgeschlagen:", e);
    return { matrix: null, docNotes: [], error: "KI-Analyse derzeit nicht möglich. Bitte später erneut versuchen." };
  }

  // Kein stilles Nichts: KI lief durch, lieferte aber keine auswertbaren Kennzahlen.
  if (!matrix || matrix.rows.length === 0) {
    console.warn(
      `[einkommen] KI lieferte keine auswertbaren Kennzahlen (Bilder: ${images.length}, PDFs: ${documents.length}, übersprungen: ${skipped}).`
    );
    return {
      matrix: null,
      docNotes: [],
      error:
        "Aus den hochgeladenen Unterlagen konnten keine auswertbaren Kennzahlen gelesen werden. " +
        "Bitte BWA, G+V/Jahresabschluss, EÜR oder Steuerbescheid als gut lesbares PDF oder Foto hochladen.",
    };
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "ai.evaluated",
    entityType: "case",
    entityId: caseId,
    metadata: { feature: "einkommen", jahre: matrix.jahre.length, images: images.length, documents: documents.length },
  });

  revalidatePath(`/cases/${caseId}/einkommen-selbststaendig`);
  return { matrix, docNotes };
}

export async function analyzeStoredSelfEmployedDocs(caseId: string, documentIds: string[]): Promise<EinkommenState> {
  const { ctx } = await requireCaseAccess(caseId);
  if (documentIds.length === 0) return { matrix: null, docNotes: [], error: "Keine Dokumente zur Analyse ausgewählt." };

  // Tenant- und Fall-Isolation direkt in der Query: nur Dokumente des eigenen Falls & der eigenen Organisation.
  const docs = await prisma.document.findMany({
    where: { id: { in: documentIds }, caseId, case: { organizationId: ctx.organizationId } },
    select: { id: true, originalName: true, mimeType: true, storageKey: true, scanStatus: true },
  });
  if (docs.length === 0) return { matrix: null, docNotes: [], error: "Dokumente nicht gefunden." };

  const storage = getStorage();
  const images: Array<{ base64: string; mimeType: string }> = [];
  const documents: Array<{ url: string; name?: string }> = [];
  for (const d of docs) {
    // Nur gescannte, freigegebene Dokumente dürfen gelesen und an die KI gesendet werden.
    if (d.scanStatus !== "ready_for_ocr") continue;
    try {
      if (VISION_MIME.has(d.mimeType)) {
        const buf = await storage.get(d.storageKey);
        if (buf) images.push({ base64: buf.toString("base64"), mimeType: d.mimeType });
      } else if (d.mimeType === "application/pdf") {
        const signed = await storage.createSignedUrl(d.storageKey, 300);
        if (signed) documents.push({ url: signed, name: d.originalName });
      }
    } catch (e) {
      // Eine fehlerhafte Datei darf nicht die gesamte Analyse blockieren.
      console.error(`[einkommen] Vorbereitung von Dokument "${d.originalName}" fehlgeschlagen:`, e);
    }
  }
  if (images.length === 0 && documents.length === 0) {
    return { matrix: null, docNotes: [], error: "Die Dokumente konnten nicht für die KI-Analyse vorbereitet werden." };
  }

  try {
    const analysis = await ai.analyzeSelfEmployedDocs(images, documents);
    const eDocs = toEinkommenDocs(analysis);
    const matrix = consolidateEinkommen(eDocs);
    const docNotes = eDocs
      .filter((x) => x.notiz.trim().length > 0)
      .map((x) => ({ label: `${DOCUMENT_TYPE_LABELS[x.dokumenttyp as DocumentType] ?? x.dokumenttyp} ${x.jahr}`, notiz: x.notiz }));
    if (!matrix || matrix.rows.length === 0) {
      return { matrix: null, docNotes: [], error: "Aus den Unterlagen konnten keine auswertbaren Kennzahlen gelesen werden." };
    }
    await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: "ai.evaluated", entityType: "case", entityId: caseId, metadata: { feature: "einkommen", jahre: matrix.jahre.length } });
    revalidatePath(`/cases/${caseId}/einkommen-selbststaendig`);
    return { matrix, docNotes };
  } catch (e) {
    console.error("[einkommen] KI-Analyse fehlgeschlagen:", e);
    return { matrix: null, docNotes: [], error: "KI-Analyse derzeit nicht möglich. Bitte später erneut versuchen." };
  }
}

export interface EinkommenPdfInput {
  jahre: number[];
  rows: Array<{ kennzahl: string; label: string; cells: Record<number, number | null>; trend: string }>;
  docNotes: Array<{ label: string; notiz: string }>;
  einkommensansatzJahr: number | null;
}

export async function createEinkommensPdfAction(
  caseId: string,
  input: EinkommenPdfInput
): Promise<{ documentId?: string; error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);

  try {
    const broker = await getBrokerInfo(ctx.organizationId);
    const caseRow = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      include: { applicants: { orderBy: { position: "asc" } } },
    });
    const applicantName = caseRow.applicants
      .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(", ");

    const monat = input.einkommensansatzJahr != null ? Math.round(input.einkommensansatzJahr / 12) : null;

    const buffer = await renderEinkommensanalyse({
      applicantName,
      caseNumber: caseRow.caseNumber,
      dateStr: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
      broker,
      jahre: input.jahre,
      rows: input.rows.map((r) => ({
        label: r.label || (KENNZAHL_LABELS[r.kennzahl as keyof typeof KENNZAHL_LABELS] ?? r.kennzahl),
        cells: r.cells,
        trend: (r.trend as EinkommenPdfInput["rows"][number]["trend"]) as "steigend" | "fallend" | "stabil" | "unbekannt",
      })),
      docNotes: input.docNotes,
      einkommensansatzJahr: input.einkommensansatzJahr,
      einkommensansatzMonat: monat,
    });

    const fileName = pdfFileName("Einkommensanalyse", caseRow.applicants);
    const stored = await getStorage().put({
      organizationId: ctx.organizationId,
      caseId,
      originalName: fileName,
      mimeType: "application/pdf",
      buffer,
    });
    const created = await prisma.document.create({
      data: {
        caseId,
        originalName: fileName,
        generatedName: fileName,
        storageKey: stored.storageKey,
        mimeType: "application/pdf",
        sizeBytes: buffer.length,
        documentType: "sonstige",
        uploadSource: "vermittler",
        scanStatus: "ready_for_ocr",
        readable: true,
      },
      select: { id: true },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "pdf.generated",
      entityType: "case",
      entityId: caseId,
      metadata: { feature: "einkommen", documentId: created.id },
    });
    revalidatePath(`/cases/${caseId}`);
    return { documentId: created.id };
  } catch {
    return { error: "PDF konnte nicht erstellt werden." };
  }
}

export type EinkommenUploadResult = { documentId?: string; error?: string };

/** Kleine Selbständigen-Datei über die Server-Action (Feld "files", genau eine). */
export async function einkommenUploadOne(caseId: string, formData: FormData): Promise<EinkommenUploadResult> {
  const { ctx } = await requireCaseAccess(caseId);
  const env = getEnv();
  const limit = await checkRateLimit(`einkommen-upload:${caseId}:${ctx.userId}`, env.UPLOAD_RATE_MAX, env.UPLOAD_RATE_WINDOW_SEC);
  if (!limit.ok) return { error: `Zu viele Uploads. Bitte in ${limit.retryAfterSec}s erneut versuchen.` };

  const file = formData.get("files");
  if (!(file instanceof File) || file.size === 0) return { error: "Keine Datei empfangen." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await processUpload({
    organizationId: ctx.organizationId,
    caseId,
    file: { name: file.name, type: file.type, size: file.size, buffer },
    uploadSource: "vermittler",
    actorUserId: ctx.userId,
  });
  if (result.ok && result.documentId) return { documentId: result.documentId };
  return { error: result.reason ?? "Datei konnte nicht verarbeitet werden." };
}

/** Signierte Upload-URL für große Selbständigen-Dateien (Direkt-Upload). */
export async function requestEinkommenUploadSlot(
  caseId: string,
  originalName: string,
  _mimeType: string
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  const env = getEnv();
  const limit = await checkRateLimit(`einkommen-upload:${caseId}:${ctx.userId}`, env.UPLOAD_RATE_MAX, env.UPLOAD_RATE_WINDOW_SEC);
  if (!limit.ok) return { error: `Zu viele Uploads. Bitte in ${limit.retryAfterSec}s erneut versuchen.` };
  const target = await getStorage().createSignedUploadUrl({ organizationId: ctx.organizationId, caseId, originalName });
  if (!target) return { error: "Direkt-Upload nicht verfügbar." };
  return target;
}

/** Verarbeitet eine per Direkt-Upload gespeicherte Selbständigen-Datei. */
export async function processEinkommenStoredUpload(
  caseId: string,
  meta: { storageKey: string; originalName: string; mimeType: string; sizeBytes: number }
): Promise<EinkommenUploadResult> {
  const { ctx } = await requireCaseAccess(caseId);
  if (!isStorageKeyForCase(meta.storageKey, ctx.organizationId, caseId)) return { error: "Ungültiger Upload-Pfad." };
  const result = await processStoredUpload({
    organizationId: ctx.organizationId,
    caseId,
    storageKey: meta.storageKey,
    originalName: meta.originalName,
    mimeType: meta.mimeType,
    uploadSource: "vermittler",
    actorUserId: ctx.userId,
  });
  if (result.ok && result.documentId) return { documentId: result.documentId };
  return { error: result.reason ?? "Datei konnte nicht verarbeitet werden." };
}
