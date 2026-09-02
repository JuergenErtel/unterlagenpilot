"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { requireDocumentAccess } from "@/lib/auth/akte-zugriff";
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
  // Zentraler Zugriffsschutz (Aktenart, Rolle, offener Auftrag); die caseId
  // aus dem Formular dient nur der Revalidierung und wird gegen die
  // Datenbank geprueft, nicht umgekehrt.
  const { dokument } = await requireDocumentAccess(documentId, { schreibend: true });
  if (dokument.caseId !== caseId) return;

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

  const { dokument } = await requireDocumentAccess(documentId, { schreibend: true });
  if (dokument.caseId !== caseId) return;

  await prisma.documentSplitSegment.deleteMany({ where: { documentId } });
  revalidatePath(`/cases/${caseId}`);
}
