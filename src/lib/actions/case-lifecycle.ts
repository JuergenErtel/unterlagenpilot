// src/lib/actions/case-lifecycle.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { purgeCase } from "@/lib/cases/purge";

/**
 * DSGVO-Löschung (Recht auf Vergessenwerden): entfernt den Fall vollständig
 * inklusive aller abhängigen Datensätze (Prisma-Cascade) und der Storage-Dateien.
 * Irreversibel – die UI verlangt eine ausdrückliche Bestätigung.
 */
export async function deleteCase(caseId: string): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  await purgeCase(caseId, { organizationId: ctx.organizationId, userId: ctx.userId, reason: "manuell" });
  revalidatePath("/cases");
  redirect("/cases");
}

/** Archiviert einen Fall (reversibel): raus aus der aktiven Fallliste. */
export async function archiveCase(caseId: string): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  await prisma.case.update({ where: { id: caseId }, data: { status: "archiviert" } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.archived",
    entityType: "case",
    entityId: caseId,
    metadata: {},
  });
  revalidatePath("/cases");
  revalidatePath(`/cases/${caseId}`);
}

/** Holt einen archivierten Fall zurück in die aktive Bearbeitung. */
export async function unarchiveCase(caseId: string): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  await prisma.case.update({ where: { id: caseId }, data: { status: "unterlagen_fehlen" } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.status_changed",
    entityType: "case",
    entityId: caseId,
    metadata: { from: "archiviert", to: "unterlagen_fehlen" },
  });
  revalidatePath("/cases");
  revalidatePath(`/cases/${caseId}`);
}
