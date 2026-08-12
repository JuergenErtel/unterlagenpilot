"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { LEAD_PHASES, LOSS_REASONS, type LeadPhase } from "@/lib/domain/enums";

/**
 * Vertriebsphase und Verlust.
 *
 * Jeder Wechsel ist eine Entscheidung des Vermittlers und landet im Audit-Log –
 * daraus lassen sich später Liegezeiten auswerten, ohne heute eine
 * Historientabelle zu bauen, die dauerhaft gepflegt werden müsste.
 */

function revalidiere(caseId: string): void {
  revalidatePath("/dashboard");
  revalidatePath(`/cases/${caseId}`);
}

export async function setzePhase(caseId: string, phase: string): Promise<{ error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  if (!(LEAD_PHASES as readonly string[]).includes(phase)) {
    return { error: "Unbekannte Phase." };
  }

  const fall = await prisma.case.findUnique({
    where: { id: caseId },
    select: { leadPhase: true, verlorenAm: true, verlorenGrund: true },
  });
  if (!fall) return { error: "Fall nicht gefunden." };
  // Gleiche Phase: kein Schreibvorgang, kein Audit-Eintrag – sonst verwässert
  // das Log und die Liegezeit springt grundlos zurück.
  if (fall.leadPhase === phase) return {};

  await prisma.case.update({
    where: { id: caseId },
    data: { leadPhase: phase as LeadPhase, leadPhaseSeit: new Date() },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.status_changed",
    entityType: "case",
    entityId: caseId,
    metadata: { leadPhaseVon: fall.leadPhase, leadPhaseNach: phase },
  });

  revalidiere(caseId);
  return {};
}

export async function setzeVerloren(
  caseId: string,
  grund: string,
  notiz?: string
): Promise<{ error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  if (!(LOSS_REASONS as readonly string[]).includes(grund)) {
    return { error: "Unbekannter Verlustgrund." };
  }

  // Die Phase bleibt bewusst stehen: So ist auswertbar, WO verloren wird.
  const gespeicherterGrund = notiz?.trim() ? `${grund}: ${notiz.trim()}` : grund;
  await prisma.case.update({
    where: { id: caseId },
    data: { verlorenAm: new Date(), verlorenGrund: gespeicherterGrund },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.status_changed",
    entityType: "case",
    entityId: caseId,
    metadata: { verloren: true, grund },
  });

  revalidiere(caseId);
  return {};
}

export async function hebeVerlustAuf(caseId: string): Promise<{ error?: string }> {
  const { ctx } = await requireCaseAccess(caseId);
  const fall = await prisma.case.findUnique({
    where: { id: caseId },
    select: { verlorenAm: true, verlorenGrund: true, leadPhase: true },
  });
  if (!fall) return { error: "Fall nicht gefunden." };
  if (!fall.verlorenAm) return {};

  await prisma.case.update({
    where: { id: caseId },
    data: { verlorenAm: null, verlorenGrund: null },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.status_changed",
    entityType: "case",
    entityId: caseId,
    metadata: { verloren: false, vorherigerGrund: fall.verlorenGrund },
  });

  revalidiere(caseId);
  return {};
}
