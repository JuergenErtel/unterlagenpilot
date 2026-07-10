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
  const current = await prisma.case.findUnique({ where: { id: caseId }, select: { status: true } });
  if (!current || current.status === "archiviert") return;

  // Bedingtes Update: verhindert, dass zwei parallele Klicks den Vorstatus
  // mit "archiviert" überschreiben.
  const { count } = await prisma.case.updateMany({
    where: { id: caseId, status: { not: "archiviert" } },
    data: { status: "archiviert", statusBeforeArchive: current.status },
  });
  if (count === 0) return;

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.archived",
    entityType: "case",
    entityId: caseId,
    metadata: { from: current.status, to: "archiviert" },
  });
  revalidatePath("/cases");
  revalidatePath(`/cases/${caseId}`);
}

/**
 * Holt einen archivierten Fall zurück – in genau den Status, in dem er
 * archiviert wurde. Ohne diese Wiederherstellung landete ein abgeschlossener
 * Fall als "Unterlagen fehlen" wieder in Dashboard, Reminder-Digest und
 * Retention-Uhr.
 */
export async function unarchiveCase(caseId: string): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);
  const current = await prisma.case.findUnique({
    where: { id: caseId },
    select: { status: true, statusBeforeArchive: true },
  });
  if (!current || current.status !== "archiviert") return;

  const restored = current.statusBeforeArchive ?? "unterlagen_fehlen";
  const { count } = await prisma.case.updateMany({
    where: { id: caseId, status: "archiviert" },
    data: { status: restored, statusBeforeArchive: null },
  });
  if (count === 0) return;

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.status_changed",
    entityType: "case",
    entityId: caseId,
    metadata: { from: "archiviert", to: restored },
  });
  revalidatePath("/cases");
  revalidatePath(`/cases/${caseId}`);
}
