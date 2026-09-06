/**
 * Fehlende Seiten aus der Fusszeile erkennen ("Seite 5 von 9").
 *
 * Fall Schmidt, 06.09.2026: Der Grundbuchauszug war EIN Blatt aus neun - nur
 * Abteilung I, weder Bestandsverzeichnis noch Belastungen. Die KI stufte ihn
 * korrekt als Grundbuchauszug ein, die Checkliste meldete Gruen. Ein Typ sagt
 * nichts darueber, ob das Dokument ganz ist. Die Fusszeile schon.
 *
 * Bewusst regelbasiert statt KI: Eine Zahl in der Fusszeile ist eindeutig, und
 * das Modell muss dafuer nicht bemueht werden. Fehlt die Fusszeile, sagt die
 * Funktion nichts (null) - kein Urteil ist besser als ein geratenes.
 */

export const SEITEN_FEHLEN_CODE = "SEITEN_FEHLEN";

/** Obergrenze fuer die Gesamtseitenzahl - darueber ist es OCR-Rauschen. */
const MAX_SEITEN = 500;

const MUSTER = [
  /\b(?:Seite|Blatt)\s*(\d{1,3})\s*(?:von|\/)\s*(\d{1,3})\b/gi,
  /\bPage\s*(\d{1,3})\s*(?:of|\/)\s*(\d{1,3})\b/gi,
];

export interface Seitenbefund {
  fehlen: boolean;
  gesamt: number;
  /** Erkannte Seitennummern, aufsteigend, ohne Doppelte. */
  vorhanden: number[];
  /** Satz fuer Marke und Warnung, z. B. "Nur Seite 5 von 9 vorhanden". */
  hinweis: string;
}

export function erkenneFehlendeSeiten(pages: Array<{ ocrText: string | null }>): Seitenbefund | null {
  let gesamt = 0;
  const nummern = new Set<number>();
  for (const p of pages) {
    const text = p.ocrText ?? "";
    for (const muster of MUSTER) {
      for (const m of text.matchAll(muster)) {
        const nr = Number(m[1]);
        const von = Number(m[2]);
        if (!Number.isFinite(nr) || !Number.isFinite(von) || von < 1 || von > MAX_SEITEN || nr < 1 || nr > von) continue;
        gesamt = Math.max(gesamt, von);
        nummern.add(nr);
      }
    }
  }
  if (gesamt === 0) return null;

  const vorhanden = [...nummern].sort((a, b) => a - b);
  // Ein Buendel aus mehreren kurzen Dokumenten ("Seite 1 von 1" dreimal) hat
  // mehr Seiten als die groesste Fusszeile verspricht - da fehlt nichts.
  const fehlen = gesamt > pages.length;
  const hinweis = !fehlen
    ? "Alle Seiten vorhanden"
    : vorhanden.length === 1
      ? `Nur Seite ${vorhanden[0]} von ${gesamt} vorhanden`
      : `Nur ${Math.min(vorhanden.length, pages.length)} von ${gesamt} Seiten vorhanden`;
  return { fehlen, gesamt, vorhanden, hinweis };
}

/** Warnung fuer die Dokumentakte, wenn Seiten fehlen - sonst null. */
export function seitenWarnung(befund: Seitenbefund | null): {
  code: string;
  severity: "warnung";
  message: string;
  customerVisible: boolean;
} | null {
  if (!befund?.fehlen) return null;
  return {
    code: SEITEN_FEHLEN_CODE,
    severity: "warnung",
    message: `${befund.hinweis} – Unterlage unvollständig. Bitte das vollständige Dokument nachreichen.`,
    customerVisible: true,
  };
}
