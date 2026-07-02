// src/lib/actions/review.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";

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
