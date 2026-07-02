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
  let nextSeq = 1;
  if (highestCaseNumber) {
    const match = highestCaseNumber.match(/(\d+)$/);
    if (match) nextSeq = parseInt(match[1]!, 10) + 1;
  }
  return `UP-${year}-${String(nextSeq).padStart(4, "0")}`;
}

/** Präfix aller Fallnummern eines Jahres (für die "höchster Fall"-Abfrage). */
export function caseNumberPrefix(year: number): string {
  return `UP-${year}-`;
}
