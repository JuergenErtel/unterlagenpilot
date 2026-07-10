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
 * Ordnet ein Dokument einem Antragsteller zu (oder hebt die Zuordnung auf).
 *
 * Nötig bei mehreren Antragstellern: Über den gemeinsamen Kunden-Upload-Link ist
 * nicht erkennbar, WESSEN Ausweis oder Gehaltsabrechnung hochgeladen wurde. Die
 * Dokumente kommen daher ohne Zuordnung an, und die Checkliste wertet sie erst
 * als erfüllt, wenn jede Person ihr Soll nachweislich geliefert hat.
 *
 * @param applicantId ID des Antragstellers oder null zum Aufheben der Zuordnung.
 */
export async function assignDocumentApplicant(
  documentId: string,
  applicantId: string | null
): Promise<void> {
  const ctx = await requireContext();

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      caseId: true,
      originalName: true,
      period: true,
      documentType: true,
      case: { select: { organizationId: true } },
    },
  });
  if (!doc || doc.case.organizationId !== ctx.organizationId) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  // Der Antragsteller MUSS zum selben Fall gehören (kein Querschreiben).
  let applicantName: string | null = null;
  if (applicantId) {
    const applicant = await prisma.applicant.findFirst({
      where: { id: applicantId, caseId: doc!.caseId },
      select: { vorname: true, nachname: true },
    });
    if (!applicant) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    applicantName = [applicant!.vorname, applicant!.nachname].filter(Boolean).join(" ") || null;
  }

  // Dateiname trägt den Antragstellernamen – nach Umzuordnung neu erzeugen.
  const generatedName = doc!.documentType
    ? generateFileName({
        documentType: doc!.documentType,
        applicantName,
        period: doc!.period,
        originalName: doc!.originalName,
      })
    : undefined;

  await prisma.document.update({
    where: { id: documentId },
    data: { applicantId, ...(generatedName ? { generatedName } : {}) },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "document.reviewed",
    entityType: "document",
    entityId: documentId,
    metadata: { assignedApplicant: applicantId ?? "none" },
  });

  revalidatePath(`/cases/${doc!.caseId}`);
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
