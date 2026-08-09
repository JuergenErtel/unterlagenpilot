import type { SeitenText } from "./types";

/**
 * Muster, an denen eine Seite ueberhaupt Verweise tragen kann. Bewusst grosszuegig
 * (Recall vor Precision): eine Seite zuviel an die KI zu geben kostet Tokens, eine
 * Seite zu wenig laesst eine Luecke unentdeckt – und das ist der teurere Fehler.
 */
export const REFERENCE_PATTERNS: RegExp[] = [
  /ur[-\s.]*nr/i,
  /urkundenrolle/i,
  /bezug\s*:/i,
  /bewilligung\s+vom/i,
  /nachtr[aä]g/i,
  /teilungserkl[aä]rung/i,
  /abteilung\s*(ii|iii|2|3)\b/i,
  /\banlage\b/i,
  /aufteilungsplan/i,
  /abgeschlossenheitsbescheinigung/i,
  /gemeinschaftsordnung/i,
  /erbbaurecht/i,
  /sonderumlage/i,
  /wirtschaftsplan/i,
  /jahresabrechnung/i,
];

/**
 * Waehlt die Seiten aus, die an die KI gehen. Harte Deckelung, weil das
 * Mistral-Konto 50.000 Tokens pro Minute erlaubt und eine Teilungserklaerung
 * 40–80 Seiten hat.
 */
export function candidatePages(
  pages: SeitenText[],
  max = 12
): Array<{ pageNumber: number; text: string }> {
  const treffer: Array<{ pageNumber: number; text: string }> = [];
  for (const p of pages) {
    const text = p.text;
    if (!text) continue;
    if (REFERENCE_PATTERNS.some((re) => re.test(text))) {
      treffer.push({ pageNumber: p.pageNumber, text });
    }
    if (treffer.length >= max) break;
  }
  return treffer;
}
