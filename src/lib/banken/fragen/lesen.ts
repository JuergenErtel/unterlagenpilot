import { normalisiere } from "../suche";

/**
 * Texte je KI-Aufruf. Klein genug, dass ein Fehlschlag wenig mitreisst.
 *
 * Zwoelf statt zwanzig: Die Wartezeit haengt nicht am Umfang der Eingabe – die
 * Bestandstexte sind winzig (Median 154 Zeichen, ganze 238 Texte zusammen nur
 * ~10.500 Token, ein Fuenftel des Minutenbudgets) – sondern daran, wieviele
 * Urteile ein einzelner Aufruf ERZEUGEN muss. Kleinere Buendel antworten
 * frueher, und mehr davon laufen nebeneinander.
 */
export const BUENDEL_GROESSE = 12;
/**
 * Gleichzeitige KI-Aufrufe. Der 429-Backoff faengt den Rest ab.
 *
 * Zehn, gemessen am schwersten Regelfall (238 Texte, Frage nach Einkommen in
 * Fremdwaehrung), je drei Laeufe im Wechsel gegen die echte Anbindung:
 *
 *   Buendel 20 / gleichzeitig  6 -> 10,4 / 10,4 / 10,5 s
 *   Buendel 12 / gleichzeitig 10 ->  6,8 /  7,0 /  6,9 s   <- gewaehlt
 *   Buendel 10 / gleichzeitig 12 ->  5,8 /  6,2 / 33,6 s
 *
 * Ab zwoelf gleichzeitigen Aufrufen greift regelmaessig der Backoff und macht
 * den Lauf drei- bis fuenfmal so langsam wie der Gewinn ausmacht. Zehn ist der
 * schnellste Wert, der noch VERLAESSLICH ist – ein Vermittler, der auf eine
 * Antwort wartet, merkt einen Ausreisser staerker als eine halbe Sekunde
 * Median. Mehr Parallelitaet hilft nicht: Weder Token- noch Anfragebudget sind
 * ausgereizt, das Limit liegt beim Anbieter im Burst.
 */
export const GLEICHZEITIG = 10;
/** Laenge je Text im Prompt. Der laengste Bestandstext liegt weit darunter. */
export const MAX_TEXTLAENGE = 1500;

/** Kuerzestes Bruchstueck, das noch als Beleg taugt. */
const MIN_BELEG = 6;

function vergleichbar(s: string): string {
  return normalisiere(s ?? "").replace(/[.,;:!?"„“»«]/g, "");
}

/**
 * Prueft, ob ein Zitat woertlich im Quelltext steht.
 *
 * Das ist die Leine am Sprachmodell: Die Antwort darf gruppieren und zaehlen,
 * aber jeder angezeigte Satz muss von Europace stammen. Verglichen wird
 * normalisiert (Kleinschreibung, Umlaute, Leerraum, Satzzeichen), damit eine
 * geglaettete Wiedergabe nicht an einem Komma scheitert.
 *
 * Ein Zitat mit Auslassung ("A … B") wird in seine Teile zerlegt: jedes Stueck
 * muss woertlich vorkommen, und zwar IN DIESER REIHENFOLGE. Ohne die
 * Reihenfolge liesse sich durch Umstellen der Sinn verkehren.
 *
 * Gegen den echten Bestand gemessen faengt das genau die Faelle, auf die es
 * ankommt: Saetze wie "Ein Dolmetscher wird nicht akzeptiert.", die das Modell
 * treffend zusammenfasst, aber so nirgends stehen, fallen durch.
 *
 * Rueckgabe: das Zitat, oder null wenn es nicht belegt ist.
 */
export function pruefeBeleg(beleg: string, quelle: string): string | null {
  const zitat = (beleg ?? "").trim();
  if (zitat.length < MIN_BELEG) return null;

  const heu = vergleichbar(quelle);
  if (!heu) return null;

  const teile = zitat
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/)
    .map(vergleichbar)
    .filter((t) => t.length > 0);
  if (teile.length === 0) return null;
  // Ein einzelnes Bruchstueck darf nicht beliebig kurz sein, sonst belegt ein
  // "und" jede Behauptung.
  if (teile.some((t) => t.length < MIN_BELEG)) return null;

  let ab = 0;
  for (const teil of teile) {
    const treffer = heu.indexOf(teil, ab);
    if (treffer === -1) return null;
    ab = treffer + teil.length;
  }
  return zitat;
}

/** Zerlegt eine Liste in Buendel fester Groesse. */
export function inBuendel<T>(items: T[], groesse: number): T[][] {
  const g = Math.max(1, Math.floor(groesse));
  const raus: T[][] = [];
  for (let i = 0; i < items.length; i += g) raus.push(items.slice(i, i + g));
  return raus;
}

/**
 * Arbeitet die Aufgaben mit begrenzter Gleichzeitigkeit ab und behaelt die
 * Reihenfolge. Ein einzelner Fehlschlag darf den ganzen Lauf nicht kippen –
 * die betroffenen Texte bleiben dann ohne Urteil, statt die Frage zu versenken.
 */
export async function parallelBegrenzt<T, R>(
  aufgaben: T[],
  grenze: number,
  arbeite: (aufgabe: T, index: number) => Promise<R>
): Promise<Array<R | null>> {
  const ergebnisse: Array<R | null> = new Array(aufgaben.length).fill(null);
  let naechster = 0;

  const arbeiter = async () => {
    for (;;) {
      const i = naechster++;
      if (i >= aufgaben.length) return;
      try {
        ergebnisse[i] = await arbeite(aufgaben[i]!, i);
      } catch (err) {
        // Keine Kundendaten im Log – nur die Stelle und der Grund.
        console.error(
          `[banken-fragen] Buendel ${i + 1} fehlgeschlagen:`,
          err instanceof Error ? err.message : "unbekannter Fehler"
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(grenze, aufgaben.length)) }, arbeiter)
  );
  return ergebnisse;
}

/** Kuerzt einen Text fuer den Prompt, ohne mitten im Wort zu enden. */
export function fuerPrompt(text: string, max = MAX_TEXTLAENGE): string {
  if (text.length <= max) return text;
  const schnitt = text.slice(0, max);
  const letzte = schnitt.lastIndexOf(" ");
  return (letzte > max * 0.6 ? schnitt.slice(0, letzte) : schnitt) + "…";
}
