import { normalisiere } from "../suche";

/** Texte je KI-Aufruf. Klein genug, dass ein Fehlschlag wenig mitreisst. */
export const BUENDEL_GROESSE = 20;
/** Gleichzeitige KI-Aufrufe. Der 429-Backoff faengt den Rest ab. */
export const GLEICHZEITIG = 4;
/** Laenge je Text im Prompt. Der laengste Bestandstext liegt weit darunter. */
export const MAX_TEXTLAENGE = 1500;

/**
 * Prueft, ob ein Zitat woertlich im Quelltext steht.
 *
 * Das ist die Leine am Sprachmodell: Die Antwort darf gruppieren und zaehlen,
 * aber jeder angezeigte Satz muss von Europace stammen. Verglichen wird
 * normalisiert (Kleinschreibung, Umlaute, Leerraum), damit eine geglaettete
 * Wiedergabe nicht an einem Bindestrich scheitert – erfundene Inhalte fallen
 * trotzdem durch.
 *
 * Rueckgabe: das Zitat, oder null wenn es nicht belegt ist.
 */
export function pruefeBeleg(beleg: string, quelle: string): string | null {
  const zitat = (beleg ?? "").trim();
  if (zitat.length < 8) return null;
  const nadel = normalisiere(zitat).replace(/[.,;:!?"„“»«]/g, "");
  const heu = normalisiere(quelle ?? "").replace(/[.,;:!?"„“»«]/g, "");
  if (!nadel || !heu.includes(nadel)) return null;
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
