/**
 * Berechnet die nächste Fallnummer aus der höchsten bestehenden Nummer des Jahres.
 *
 * Bewusst NICHT auf Basis von count(+1): eine gelöschte Fallnummer würde den Count
 * senken und die nächste Nummer mit einer bestehenden kollidieren lassen. Der
 * höchste vergebene Wert (+1) ist gegen Löschungen robust.
 *
 * @param highestCaseNumber höchste bestehende Fallnummer der Organisation im Jahr
 *   (z.B. "UP-2026-0007") oder null, wenn noch keine existiert.
 */
export function computeNextCaseNumber(highestCaseNumber: string | null, year: number): string {
  const seq = highestCaseNumber ? sequenceOf(highestCaseNumber) : 0;
  return formatCaseNumber(year, seq + 1);
}

/** Laufnummer am Ende einer Fallnummer ("UP-2026-0007" → 7); 0, wenn keine erkennbar. */
export function sequenceOf(caseNumber: string): number {
  const match = caseNumber.match(/(\d+)$/);
  return match ? parseInt(match[1]!, 10) : 0;
}

/**
 * Höchste Laufnummer einer Menge von Fallnummern – NUMERISCH.
 *
 * Ein lexikografisches Maximum (SQL `ORDER BY caseNumber DESC`) liefert ab der
 * 10.000. Nummer den falschen Wert ("…-9999" > "…-10000", weil "9" > "1"), wodurch
 * die Vergabe dauerhaft dieselbe, bereits belegte Nummer erzeugen würde.
 */
export function highestSequence(caseNumbers: string[]): number {
  let max = 0;
  for (const n of caseNumbers) max = Math.max(max, sequenceOf(n));
  return max;
}

/** Baut eine Fallnummer; mindestens 4-stellig gepolstert, darüber hinaus wachsend. */
export function formatCaseNumber(year: number, sequence: number): string {
  return `${caseNumberPrefix(year)}${String(sequence).padStart(4, "0")}`;
}

/** Präfix aller Fallnummern eines Jahres (für die "höchster Fall"-Abfrage). */
export function caseNumberPrefix(year: number): string {
  return `UP-${year}-`;
}
