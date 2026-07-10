import type { ConsolidatedMatrix } from "@/lib/einkommen/consolidate";

/** Betrachtungszeitraum für den nachhaltigen Einkommensansatz. */
export const ANSATZ_MAX_YEARS = 3;

export interface JahresWert {
  jahr: number;
  betrag: number;
}

/**
 * Die letzten bis zu `maxYears` Jahre mit Wert, aufsteigend sortiert.
 * Einzige Definition von „letzte Jahre" – Ansatz-Vorschlag UND Bank-Begleittext
 * müssen sich auf dieselbe Jahresmenge stützen, sonst nennt ein und dasselbe
 * PDF zwei verschiedene „Durchschnitte".
 */
export function lastYearsWithValue(values: JahresWert[], maxYears = ANSATZ_MAX_YEARS): JahresWert[] {
  return [...values].sort((a, b) => a.jahr - b.jahr).slice(-maxYears);
}

/** Durchschnitt über die letzten bis zu `maxYears` Jahre. null, wenn keine Werte. */
export function averageOfLastYears(
  values: JahresWert[],
  maxYears = ANSATZ_MAX_YEARS
): { years: JahresWert[]; average: number } | null {
  const years = lastYearsWithValue(values, maxYears);
  if (years.length === 0) return null;
  const average = years.reduce((acc, v) => acc + v.betrag, 0) / years.length;
  return { years, average };
}

/**
 * Vorschlag für den nachhaltigen Einkommensansatz: Durchschnitt der Kennzahl
 * `gewinn` über die letzten bis zu 3 Jahre mit Wert, abgerundet auf volle 100 €.
 * null, wenn keine Gewinn-Werte vorliegen. Nur Vorbelegung – Vermittler entscheidet.
 */
export function suggestEinkommensansatz(matrix: ConsolidatedMatrix): number | null {
  const gewinnRow = matrix.rows.find((r) => r.kennzahl === "gewinn");
  if (!gewinnRow) return null;
  const values: JahresWert[] = matrix.jahre
    .filter((j) => gewinnRow.cells[j])
    .map((j) => ({ jahr: j, betrag: gewinnRow.cells[j]!.value }));
  const avg = averageOfLastYears(values);
  if (!avg) return null;
  return Math.floor(avg.average / 100) * 100;
}
