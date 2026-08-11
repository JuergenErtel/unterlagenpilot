/**
 * Gemeinsame Textfaltung fuer Namen und Labels: Kleinschreibung, Umlaut/ß-Expansion,
 * Diakritika-Entfernung. Zwei Aufrufer nutzen dieselbe Basis-Normalisierung, aber
 * fuehren unterschiedliche abschliessende Schritte durch: `tokenize()` spaltet nach
 * Woertergrenzen auf, waehrend Ganzzahl-Label-Vergleiche alle Sonderzeichen streichen.
 */
export function faltenBasis(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    // Kombinierende Akzente (é, ñ, …) entfernen. Bewusst als Escape-Bereich
    // notiert – literale Kombinationszeichen im Quelltext sind unlesbar.
    .replace(/[\u0300-\u036f]/g, "");
}
