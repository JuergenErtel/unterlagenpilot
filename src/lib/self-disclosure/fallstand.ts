import type { FinancingType } from "@/lib/domain/enums";

/**
 * Die Spalten am FALL selbst, auf die der Fragenkatalog zielt
 * (`ziel.entitaet: "case"`) – als Prisma-`select` und als Abbildung in
 * `Fallstand.caseFelder`.
 *
 * Warum ein eigener Helfer: Sechs Stellen bauen einen Fallstand (Fallakte,
 * Erstgespräch, Review-Center, Tagesliste, Übernahme, Fallgeburt), und bis
 * 08.10.2026 schrieb jede `{ financingType }` von Hand. Ein neues Fallfeld im
 * Katalog hätte an jeder vergessenen Stelle als leer gegolten: dauerhaft eine
 * „Lücke" im Eingang und ein leeres Feld in der Erstgesprächsmaske, obwohl der
 * Wert gespeichert ist. Über den Parametertyp meldet jetzt der Compiler jede
 * Abfrage, die eine Spalte nicht mitlädt.
 */
export const CASE_ZIELFELDER_SELECT = {
  financingType: true,
  warmmieteMonatlich: true,
  unterhaltMonatlich: true,
} as const;

export function caseFelderAus(row: {
  financingType: FinancingType | null;
  warmmieteMonatlich: number | null;
  unterhaltMonatlich: number | null;
}): Record<string, unknown> {
  return {
    financingType: row.financingType ?? null,
    warmmieteMonatlich: row.warmmieteMonatlich ?? null,
    unterhaltMonatlich: row.unterhaltMonatlich ?? null,
  };
}
