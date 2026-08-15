import { prisma } from "@/lib/db";
import { caseNumberPrefix, formatCaseNumber, highestSequence } from "@/lib/cases/case-number";

/** true, wenn der Fehler eine Prisma-Unique-Constraint-Verletzung (P2002) ist. */
function istNummernkollision(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/**
 * Vergibt die nächste freie Fallnummer und führt damit die Anlage aus.
 *
 * Warum als Rahmen und nicht als „gib mir eine Nummer": Zwei gleichzeitige
 * Anlagen berechnen dieselbe Nummer, und erst das Schreiben merkt es
 * (`@@unique([organizationId, caseNumber])`). Der Wiederholversuch muss
 * deshalb die Anlage selbst umfassen — und weil die Fallgeburt aus dem
 * Anfrageformular in einer Transaktion läuft, muss der ganze Rumpf
 * wiederholbar sein.
 *
 * Es gab diese Logik einmal privat in `createCase`. Zwei Fassungen davon
 * laufen auseinander, und die Race-Behandlung ist nichts, was man zweimal
 * richtig schreibt.
 */
export async function mitFallnummer<T>(
  organizationId: string,
  jahr: number,
  versuch: (fallnummer: string) => Promise<T>,
  maxVersuche = 5
): Promise<T> {
  let letzter: unknown = null;
  for (let n = 0; n < maxVersuche; n++) {
    const rows = await prisma.case.findMany({
      where: { organizationId, caseNumber: { startsWith: caseNumberPrefix(jahr) } },
      select: { caseNumber: true },
    });
    const fallnummer = formatCaseNumber(jahr, highestSequence(rows.map((r) => r.caseNumber)) + 1);
    try {
      return await versuch(fallnummer);
    } catch (e) {
      if (!istNummernkollision(e)) throw e;
      letzter = e;
    }
  }
  throw new Error(`Fallnummer konnte nicht vergeben werden (${maxVersuche} Versuche).`, {
    cause: letzter,
  });
}
