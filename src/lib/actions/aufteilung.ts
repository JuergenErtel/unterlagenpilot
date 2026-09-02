"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext, akteSichtbarWhere } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { teileAuf } from "@/lib/aufteilung/service";

/**
 * Trennt eine Sammeldatei entlang des Vorschlags auf – nur auf Klick.
 * Der Detektiv und die Erkennung schlagen vor, entschieden wird hier.
 */
export async function aufteilenAction(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const documentId = String(formData.get("documentId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  if (!documentId || !caseId) return;

  const ergebnis = await teileAuf(documentId, ctx.organizationId);
  if (ergebnis.ok) {
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "document.reclassified",
      entityType: "Document",
      entityId: documentId,
      metadata: { aufgeteiltIn: ergebnis.anzahl },
    });
  }
  revalidatePath(`/cases/${caseId}`);
}

/** Vorschlag verwerfen: die Datei bleibt unveraendert. */
export async function aufteilungVerwerfenAction(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const documentId = String(formData.get("documentId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  if (!documentId || !caseId) return;

  const doc = await prisma.document.findFirst({
    where: { id: documentId, case: akteSichtbarWhere(ctx) },
    select: { id: true },
  });
  if (!doc) return;

  await prisma.documentSplitSegment.deleteMany({ where: { documentId } });
  revalidatePath(`/cases/${caseId}`);
}
