import { prisma } from "@/lib/db";
import { getStorage, casePathPrefix } from "@/lib/storage";
import { audit } from "@/lib/audit";

export interface PurgeOptions {
  organizationId: string;
  userId: string | null;
  /** Löschgrund fürs Audit, z. B. "manuell" oder "retention". */
  reason: string;
}

/**
 * Löscht einen Fall vollständig: entfernt die Storage-Dateien, dann den Fall
 * inkl. aller abhängigen Zeilen (Prisma onDelete: Cascade), und protokolliert die
 * vollzogene Löschung. Kein Auth/Redirect – Aufrufer stellt die Berechtigung sicher.
 *
 * Reihenfolge ist bewusst gewählt:
 *  - Storage ZUERST, solange die storageKeys noch in der DB stehen. Umgekehrt
 *    bliebe bei einem Storage-Ausfall eine personenbezogene Datei im Bucket, ohne
 *    dass noch ein Verweis auf sie existiert.
 *  - Audit ZULETZT (AuditLog.entityId ist ein reiner String ohne FK auf Case,
 *    der Nachweis überlebt das Cascade-Delete), damit kein Löschnachweis für
 *    einen Fall entsteht, dessen Löschung gescheitert ist.
 *
 * Ein fehlgeschlagenes Storage-Remove bricht die Löschung NICHT ab (das Recht auf
 * Löschung darf nicht an einer Storage-Störung hängen), wird aber protokolliert,
 * statt still verschluckt zu werden.
 */
export async function purgeCase(
  caseId: string,
  opts: PurgeOptions
): Promise<{ documents: number; storageErrors: number }> {
  const [caseRow, docs] = await Promise.all([
    prisma.case.findUnique({ where: { id: caseId }, select: { caseNumber: true } }),
    prisma.document.findMany({ where: { caseId }, select: { storageKey: true } }),
  ]);

  const storage = getStorage();
  let storageErrors = 0;
  for (const d of docs) {
    if (!d.storageKey) continue;
    try {
      await storage.remove(d.storageKey);
    } catch (e) {
      storageErrors += 1;
      // Nur ins flüchtige Server-Log: storageKeys enthalten den (bereinigten)
      // Originaldateinamen und damit personenbezogene Daten.
      console.error(`[purgeCase] Storage-Objekt ${d.storageKey} nicht entfernbar:`, e);
    }
  }

  await prisma.case.delete({ where: { id: caseId } });

  await audit({
    organizationId: opts.organizationId,
    userId: opts.userId,
    action: "case.deleted",
    entityType: "case",
    entityId: caseId,
    metadata: {
      caseNumber: caseRow?.caseNumber,
      documents: docs.length,
      reason: opts.reason,
      // NUR die Anzahl – niemals die storageKeys selbst: sie enthalten
      // Dateinamen wie "Personalausweis_Max_Mustermann.pdf" und würden die
      // gerade gelöschten personenbezogenen Daten im Audit-Log verewigen.
      // Zum Aufräumen genügt der fallbezogene Objekt-Präfix (nur IDs).
      storageErrors,
      ...(storageErrors > 0 ? { orphanPrefix: casePathPrefix(opts.organizationId, caseId) } : {}),
    },
  });

  return { documents: docs.length, storageErrors };
}
