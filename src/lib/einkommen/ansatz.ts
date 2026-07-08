import type { ConsolidatedMatrix } from "@/lib/einkommen/consolidate";

/**
 * Vorschlag für den nachhaltigen Einkommensansatz: Durchschnitt der Kennzahl
 * `gewinn` über die letzten bis zu 3 Jahre mit Wert, abgerundet auf volle 100 €.
 * null, wenn keine Gewinn-Werte vorliegen. Nur Vorbelegung – Vermittler entscheidet.
 */
export function suggestEinkommensansatz(matrix: ConsolidatedMatrix): number | null {
  const gewinnRow = matrix.rows.find((r) => r.kennzahl === "gewinn");
  if (!gewinnRow) return null;
  const years = matrix.jahre.filter((j) => gewinnRow.cells[j]).sort((a, b) => a - b);
  if (years.length === 0) return null;
  const lastYears = years.slice(-3);
  const sum = lastYears.reduce((acc, j) => acc + gewinnRow.cells[j]!.value, 0);
  return Math.floor(sum / lastYears.length / 100) * 100;
}
