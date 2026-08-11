import daten from "./kategorien.json";

/**
 * Die Oberflaeche von Europace gruppiert die 69 Kriterien; die Schnittstelle
 * liefert diese Zuordnung NICHT mit. Sie wurde einmal aus der Oberflaeche
 * gezogen und liegt hier als Datei.
 *
 * Bewusst in src/ und nicht in data/: data/ ist unversioniert (Rohabzug,
 * 12 MB), diese Datei ist 2 KB gross und gehoert fachlich zum Code – sonst
 * fehlte sie beim Bauen in der Produktion.
 */
const ZUORDNUNG: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [kategorie, namen] of Object.entries(
    daten.kategorien as Record<string, string[]>
  )) {
    for (const n of namen) m[n] = kategorie;
  }
  return m;
})();

/**
 * Alle bekannten Kriteriennamen in Katalogreihenfolge.
 *
 * Das ist die Liste, die der KI beim Deuten einer Frage vorgelegt wird – und
 * zugleich der Pruefstein danach: Was nicht hier steht, hat sie erfunden.
 */
export function alleKriterien(): string[] {
  return Object.keys(ZUORDNUNG);
}

/** Reihenfolge der Abschnitte auf der Bankseite. */
export const KATEGORIE_REIHENFOLGE = [
  "Antragsteller",
  "Immobilie",
  "Vorhaben",
  "Prozesse",
  "Sonstige",
];

/**
 * Ein unbekanntes Kriterium landet in "Sonstige", statt den Import scheitern zu
 * lassen – Europace kann den Katalog jederzeit erweitern.
 */
export function kategorieFuer(kriterium: string): string {
  return ZUORDNUNG[kriterium] ?? "Sonstige";
}
