import { normText, normUrkundenNummer } from "./fingerprint";
import type { DocReference, SelbstAuskunft } from "./types";

export type MatchResult =
  | { kind: "sicher"; documentId: string }
  | { kind: "unsicher"; documentId: string }
  | { kind: "keiner" };

/** Kleinschreibung, Umlaute aufgeloest, alles Nicht-Alphanumerische entfernt. */
export function normalizeLabel(s: string): string {
  return normText(s);
}

const WORT_ZAHL: Record<string, number> = {
  erster: 1, erste: 1, ersten: 1,
  zweiter: 2, zweite: 2, zweiten: 2,
  dritter: 3, dritte: 3, dritten: 3,
  vierter: 4, vierte: 4, vierten: 4,
  fuenfter: 5, fuenfte: 5, fuenften: 5,
};

const ROEMISCH: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

/**
 * Ordnungszahl aus einem Label. "2.", "zweiter" und "II." fuehren alle auf 2.
 * Ohne diese Vereinheitlichung findet Stufe 3 des Abgleichs praktisch nie einen
 * Treffer, weil Kanzleien und Grundbuchaemter beliebig zwischen den
 * Schreibweisen wechseln.
 */
export function ordinalOf(s: string): number | null {
  const t = `${s.toLowerCase().replace(/ü/g, "ue").replace(/ä/g, "ae").replace(/ö/g, "oe")} `;
  const ziffer = t.match(/(?:^|\s)(\d{1,2})\.\s/);
  if (ziffer?.[1]) return Number(ziffer[1]);
  const roem = t.match(/(?:^|\s)(i{1,3}|iv|v)\.\s/);
  if (roem?.[1]) return ROEMISCH[roem[1]] ?? null;
  for (const [wort, zahl] of Object.entries(WORT_ZAHL)) {
    if (t.includes(wort)) return zahl;
  }
  return null;
}

/**
 * Bedeutsame Woerter eines Labels. Die Bezeichnungen weichen in der Praxis
 * stark ab ("2. Nachtrag zur Teilungserklaerung" vs. "II. Nachtrag TE"), ein
 * Praefixvergleich scheitert daran. Ein geteiltes langes Wort ist das
 * belastbarste einfache Signal.
 */
function bedeutsameWoerter(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/ä/g, "a")
      .replace(/ö/g, "o")
      .replace(/ü/g, "u")
      .replace(/ß/g, "ss")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 6)
  );
}

/**
 * Stufenweiser Abgleich – die erste greifende Stufe gewinnt.
 *  1. Urkundennummer identisch           → sicher
 *  2. Datum identisch                    → sicher
 *  3. Label aehnlich, Ordnungszahl passt  → unsicher (Rueckfrage statt Behauptung)
 *  4. sonst                              → keiner
 */
export function matchReference(ref: DocReference, vorhanden: SelbstAuskunft[]): MatchResult {
  const refNr = normUrkundenNummer(ref.urkundenNummer);
  if (refNr) {
    const treffer = vorhanden.find((d) => normUrkundenNummer(d.urkundenNummer) === refNr);
    if (treffer) return { kind: "sicher", documentId: treffer.documentId };
  }

  if (ref.urkundeDatum) {
    const treffer = vorhanden.find((d) => d.urkundeDatum === ref.urkundeDatum);
    if (treffer) return { kind: "sicher", documentId: treffer.documentId };
  }

  const refOrd = ordinalOf(ref.label);
  const refWoerter = bedeutsameWoerter(ref.label);
  const kandidat = vorhanden.find((d) => {
    const dOrd = ordinalOf(d.label);
    // Nur ausschliessen, wenn BEIDE eine Ordnungszahl tragen und sie abweicht.
    // Ein Dokument ohne Ordnungszahl bleibt Kandidat – dafuer gibt es "unsicher".
    if (refOrd != null && dOrd != null && refOrd !== dOrd) return false;
    const dWoerter = bedeutsameWoerter(d.label);
    for (const w of refWoerter) if (dWoerter.has(w)) return true;
    return false;
  });
  if (kandidat) return { kind: "unsicher", documentId: kandidat.documentId };

  return { kind: "keiner" };
}
