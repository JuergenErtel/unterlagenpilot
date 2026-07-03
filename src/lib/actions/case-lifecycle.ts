// src/lib/actions/case-lifecycle.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCaseAccess } from "@/lib/auth/context";
import { getStorage } from "@/lib/storage";
import { audit } from "@/lib/audit";

/**
 * DSGVO-Löschung (Recht auf Vergessenwerden): entfernt den Fall vollständig
 * inklusive aller abhängigen Datensätze (Prisma-Cascade) und der Storage-Dateien.
 * Irreversibel – die UI verlangt eine ausdrückliche Bestätigung.
 */
export async function deleteCase(caseId: string): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);

  const [caseRow, docs] = await Promise.all([
    prisma.case.findUnique({ where: { id: caseId }, select: { caseNumber: true } }),
    prisma.document.findMany({ where: { caseId }, select: { storageKey: true } }),
  ]);

  // Zuerst protokollieren: der Audit-Log referenziert den Fall nicht per FK und
  // bleibt daher auch nach dem Cascade-Delete als Löschnachweis erhalten.
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.deleted",
    entityType: "case",
    entityId: caseId,
    metadata: { caseNumber: caseRow?.caseNumber, documents: docs.length },
  });

  // DB: Case + alle abhängigen Zeilen (onDelete: Cascade).
  await prisma.case.delete({ where: { id: caseId } });

  // Storage: Dateien best-effort entfernen (Fehler dürfen die Löschung nicht blockieren).
  const storage = getStorage();
  for (const d of docs) {
    if (d.storageKey) await storage.remove(d.storageKey).catch(() => {});
  }

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
