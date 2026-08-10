/**
 * Kleinschreibung, Umlaute in die ae-Form. Ohne das findet "muenchen" nichts,
 * und genau so tippt man im Alltag.
 */
export function normalisiere(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

/** Leere Suche liefert alles. */
export function passtZurSuche(name: string, suche: string): boolean {
  const s = normalisiere(suche);
  if (!s) return true;
  return normalisiere(name).includes(s);
}
