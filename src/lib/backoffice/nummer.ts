import { prisma } from "@/lib/db";
import { highestSequence } from "@/lib/cases/case-number";

/** Praefix aller Auftragsnummern eines Jahres. */
export function auftragsnummerPrefix(jahr: number): string {
  return `BO-${jahr}-`;
}

/** Auftragsnummer, mindestens vierstellig gepolstert. */
export function formatAuftragsnummer(jahr: number, laufnummer: number): string {
  return `${auftragsnummerPrefix(jahr)}${String(laufnummer).padStart(4, "0")}`;
}

function istNummernkollision(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/**
 * Vergibt die naechste freie Auftragsnummer und fuehrt damit die Anlage aus -
 * derselbe Rahmen wie `mitFallnummer`: Zwei gleichzeitige Anlagen berechnen
 * dieselbe Nummer, erst der Unique-Index merkt es, und der Wiederholversuch
 * muss die ganze Anlage umfassen.
 */
export async function mitAuftragsnummer<T>(
  backofficeOrganizationId: string,
  jahr: number,
  versuch: (auftragsnummer: string) => Promise<T>,
  maxVersuche = 5
): Promise<T> {
  let letzter: unknown = null;
  for (let n = 0; n < maxVersuche; n++) {
    const rows = await prisma.backofficeAuftrag.findMany({
      where: { backofficeOrganizationId, auftragsnummer: { startsWith: auftragsnummerPrefix(jahr) } },
      select: { auftragsnummer: true },
    });
    const nummer = formatAuftragsnummer(jahr, highestSequence(rows.map((r) => r.auftragsnummer)) + 1);
    try {
      return await versuch(nummer);
    } catch (e) {
      if (!istNummernkollision(e)) throw e;
      letzter = e;
    }
  }
  throw new Error(`Auftragsnummer konnte nicht vergeben werden (${maxVersuche} Versuche).`, {
    cause: letzter,
  });
}
