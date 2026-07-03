import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { audit } from "@/lib/audit";

export interface PurgeOptions {
  organizationId: string;
  userId: string | null;
  /** Löschgrund fürs Audit, z. B. "manuell" oder "retention". */
  reason: string;
}

/**
 * Löscht einen Fall vollständig: protokolliert die Löschung, entfernt den Fall
 * inkl. aller abhängigen Zeilen (Prisma onDelete: Cascade) und die Storage-Dateien
 * (best-effort). Kein Auth/Redirect – Aufrufer stellt die Berechtigung sicher.
 */
export async function purgeCase(caseId: string, opts: PurgeOptions): Promise<{ documents: number }> {
  const [caseRow, docs] = await Promise.all([
    prisma.case.findUnique({ where: { id: caseId }, select: { caseNumber: true } }),
    prisma.document.findMany({ where: { caseId }, select: { storageKey: true } }),
  ]);

  // Zuerst protokollieren: der Audit-Log referenziert den Fall nicht per FK und
  // bleibt daher auch nach dem Cascade-Delete als Löschnachweis erhalten.
  await audit({
    organizationId: opts.organizationId,
    userId: opts.userId,
    action: "case.deleted",
    entityType: "case",
    entityId: caseId,
    metadata: { caseNumber: caseRow?.caseNumber, documents: docs.length, reason: opts.reason },
  });

  await prisma.case.delete({ where: { id: caseId } });

  const storage = getStorage();
  for (const d of docs) {
    if (d.storageKey) await storage.remove(d.storageKey).catch(() => {});
  }

  return { documents: docs.length };
}
