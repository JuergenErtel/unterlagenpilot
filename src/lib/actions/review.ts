// src/lib/actions/review.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { generateFileName } from "@/lib/documents/filename";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/enums";

export type FieldReviewMode = "akzeptieren" | "korrigieren" | "ignorieren";

/**
 * Prüft/korrigiert ein einzelnes von der KI erkanntes Feld (Review-Center).
 *  - akzeptieren: Wert bleibt, Feld gilt als geprüft.
 *  - korrigieren: Vermittler-Wert schlägt KI (correctedValue).
 *  - ignorieren:  Feld wird geleert (correctedValue = "") und gilt als geprüft.
 */
export async function reviewExtractedField(
  fieldId: string,
  mode: FieldReviewMode,
  value?: string
): Promise<void> {
  const ctx = await requireContext();

  // Tenant-Isolation: Feld muss zu einem Dokument der eigenen Organisation gehören.
  const field = await prisma.extractedFieldRecord.findUnique({
    where: { id: fieldId },
    select: { id: true, document: { select: { caseId: true, case: { select: { organizationId: true } } } } },
  });
  if (!field || field.document.case.organizationId !== ctx.organizationId) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  const trimmed = value?.trim();
  if (mode === "korrigieren" && !trimmed) {
    throw new Error("Bitte einen korrigierten Wert angeben.");
  }

  await prisma.extractedFieldRecord.update({
    where: { id: fieldId },
    data: {
      reviewed: true,
      ...(mode === "korrigieren" ? { correctedValue: trimmed } : {}),
      ...(mode === "ignorieren" ? { correctedValue: "" } : {}),
    },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "document.reviewed",
    entityType: "extracted_field",
    entityId: fieldId,
    metadata: { mode },
  });

  revalidatePath(`/cases/${field!.document.caseId}`);
  revalidatePath("/review");
}

/**
 * Manuelles Umkategorisieren eines Dokuments (KI-Fehlsortierung korrigieren).
 * Setzt den Typ und erzeugt den Dateinamen deterministisch neu – KEIN KI-Aufruf.
 * Bereits extrahierte Felder bleiben unverändert; eine Neu-Extraktion für den neuen
 * Typ erfolgt nur, wenn der Vermittler anschließend "KI-Prüfung starten" auslöst.
 */
export async function reclassifyDocument(
  documentId: string,
  newType: DocumentType
): Promise<void> {
  if (!DOCUMENT_TYPES.includes(newType)) {
    throw new Error(`Unbekannter Dokumenttyp: ${newType}`);
  }

  const ctx = await requireContext();

  // Tenant-Isolation: Dokument muss zur Organisation des Nutzers gehören.
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      caseId: true,
      originalName: true,
      period: true,
      documentType: true,
      case: { select: { organizationId: true } },
      applicant: { select: { vorname: true, nachname: true } },
    },
  });
  if (!doc || doc.case.organizationId !== ctx.organizationId) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  const applicantName =
    [doc!.applicant?.vorname, doc!.applicant?.nachname].filter(Boolean).join(" ") || null;
  const generatedName = generateFileName({
    documentType: newType,
    applicantName,
    period: doc!.period,
    originalName: doc!.originalName,
  });

  await prisma.document.update({
    where: { id: documentId },
    data: { documentType: newType, generatedName, classificationStatus: "fertig" },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "document.reclassified",
    entityType: "document",
    entityId: documentId,
    metadata: { from: doc!.documentType, to: newType },
  });

  revalidatePath(`/cases/${doc!.caseId}`);
  revalidatePath("/review");
}
