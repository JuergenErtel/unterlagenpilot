// src/lib/actions/einkommen.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { processUpload } from "@/lib/documents/pipeline";
import { getStorage } from "@/lib/storage";
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
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await processUpload({
      organizationId: ctx.organizationId,
      caseId,
      file: { name: file.name, type: file.type, size: file.size, buffer },
      uploadSource: "vermittler",
      actorUserId: ctx.userId,
    });
    if (!result.ok || !result.documentId) continue;
    if (VISION_MIME.has(file.type)) {
      images.push({ base64: buffer.toString("base64"), mimeType: file.type });
    } else if (file.type === "application/pdf") {
      const d = await prisma.document.findUnique({ where: { id: result.documentId }, select: { storageKey: true } });
      const signed = d ? await storage.createSignedUrl(d.storageKey, 300) : null;
      if (signed) documents.push({ url: signed, name: file.name });
    }
  }

  if (images.length === 0 && documents.length === 0) {
    return { matrix: null, docNotes: [], error: "Für die KI-Analyse bitte JPG/PNG- oder PDF-Unterlagen hochladen." };
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
  } catch {
    return { matrix: null, docNotes: [], error: "KI-Analyse derzeit nicht möglich. Bitte später erneut versuchen." };
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

export interface EinkommenPdfInput {
  jahre: number[];
  rows: Array<{ kennzahl: string; label: string; cells: Record<number, number | null>; trend: string }>;
  docNotes: Array<{ label: string; notiz: string }>;
  einkommensansatzJahr: number | null;
}

export async function createEinkommensPdfAction(
  caseId: string,
  input: EinkommenPdfInput
): Promise<{ documentId: string }> {
  const { ctx } = await requireCaseAccess(caseId);
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
}
