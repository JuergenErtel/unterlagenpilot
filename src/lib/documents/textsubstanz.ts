/**
 * Hat ein Dokument ueberhaupt eine Textgrundlage, auf der sich einstufen laesst?
 *
 * Hintergrund (Fall Topcic, gefunden am 18.08.2026): `Ausweis_Mate.pdf` war als
 * **Grundbuchauszug** eingestuft – mit Konfidenz 0,98 und vom Vermittler
 * freigegeben. Die Checkliste meldete daraufhin "Grundbuchauszug vorhanden",
 * obwohl im Fall keiner lag. Ein falsches Gruen ist gefaehrlicher als ein
 * fehlendes Dokument: Es faellt erst bei der Bank auf.
 *
 * Die Wurzel war weder das Modell noch die Freigabe, sondern die Grundlage:
 * Die OCR hatte fuer diese Datei **nichts als Bildplatzhalter** geliefert –
 * nach Abzug der Platzhalter blieben 4 Zeichen. Das Klassifikationsschema
 * verlangt aber einen Typ, also hat das Modell einen erfunden und sich seiner
 * sicher gezeigt. Deshalb hilft es auch nicht, die Konfidenz sichtbar zu
 * machen: Alle 11 Dokumente der Produktionsdatenbank lagen bei 0,98 bis 1,00 –
 * ausgerechnet das falsche mit 0,98. Die Zahl traegt keine Information.
 *
 * Die Schwelle ist an den echten Dokumenten geeicht, nicht geraten:
 *
 *   Ausweis_Mate.pdf (falsch eingestuft)      4 Zeichen
 *   Ausweis_hinten (echter Ausweis)         222 Zeichen
 *   Ausweis_vorne (echter Ausweis)          325 Zeichen
 *   alle uebrigen                        4.600 bis 144.799 Zeichen
 *
 * Ein Personalausweis ist das textaermste echte Dokument ueberhaupt – liegt
 * mit 222 Zeichen aber noch um ein Vielfaches ueber der Schwelle.
 */

/** Ab wie vielen Zeichen echten Textes eine Einstufung zulaessig ist. */
export const MIN_TEXTSUBSTANZ = 40;

/**
 * Bildplatzhalter der OCR: `![img-0.jpeg](img-0.jpeg)`.
 *
 * Mistral gibt fuer eine Seite ohne erkennbaren Text genau diese Marken aus.
 * Sie sind Laenge ohne Inhalt und muessen vor dem Zaehlen weg – sonst gilt
 * eine reine Bildseite als 79 Zeichen "Text".
 */
const BILDPLATZHALTER = /!\[[^\]]*\]\([^)]*\)/g;

/** Zahl der Zeichen echten Textes – ohne Bildplatzhalter und Leerraum. */
export function textSubstanz(text: string | null | undefined): number {
  if (!text) return 0;
  return text.replace(BILDPLATZHALTER, "").replace(/\s+/g, "").length;
}

/** Reicht der erkannte Text, um daraus einen Dokumenttyp abzuleiten? */
export function hatTextgrundlage(text: string | null | undefined): boolean {
  return textSubstanz(text) >= MIN_TEXTSUBSTANZ;
}
