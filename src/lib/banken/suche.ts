/**
 * Kleinschreibung, Umlaute in die ae-Form. Ohne das findet "muenchen" nichts,
 * und genau so tippt man im Alltag.
 */
export function normalisiere(s: string): string {
  return s
    // Zerlegte Umlaute ("u" + Trema) zu einem Zeichen – aus Europace kommen
    // beide Schreibweisen, und nur die zusammengesetzte trifft /ü/.
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kurzformen der Institutsgruppen, wie Europace sie fuehrt – je Zeile ein
 * ganzes Wort und die Form, auf die es gebracht wird.
 *
 * Die Zielform ist bewusst die KURZE bzw. eine Form, die die kurze ENTHAELT:
 * "Kreissparkasse" wird "kreisspk", und darin steckt "spk". So findet
 * "Sparkasse Koeln" auch die "KSK Koeln", ohne dass jemand die Gruppen
 * auswendig kennen muss. Umgekehrt wird "Volksbank" NICHT auf "voba"
 * verkuerzt, sondern "voba"/"vb" ausgeschrieben – "vb" als Zielform steckte
 * sonst in halb Deutschland.
 */
const KURZFORMEN: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bksk\b/g, "kreisspk"],
  [/\bssk\b/g, "stadtspk"],
  [/sparkasse/g, "spk"],
  [/\bvoba\b/g, "volksbank"],
  [/\bvb\b/g, "volksbank"],
  [/\braiba\b/g, "raiffeisenbank"],
  [/\brb\b/g, "raiffeisenbank"],
  [/\bvrb\b/g, "vr bank"],
];

/**
 * Vergleichsform eines Banknamens: normalisiert, Bindestriche zu Leerzeichen,
 * Kurzformen angeglichen. Nur zum VERGLEICHEN – nie anzeigen.
 *
 * Bis 08.09.2026 verglich die Suche den rohen Namen; "Sparkasse
 * Westmuensterland" fand die "Spk Westmuensterland" nicht, obwohl 203 der
 * 664 Banken genau so heissen.
 */
export function kanonisch(s: string): string {
  let k = normalisiere(s).replace(/-/g, " ").replace(/\s+/g, " ");
  for (const [muster, ersatz] of KURZFORMEN) k = k.replace(muster, ersatz);
  return k.trim();
}

/** Leere Suche liefert alles. */
export function passtZurSuche(name: string, suche: string): boolean {
  const s = kanonisch(suche);
  if (!s) return true;
  return kanonisch(name).includes(s);
}
