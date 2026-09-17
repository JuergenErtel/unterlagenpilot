import type { DocumentType } from "@/lib/domain/enums";

/**
 * Welche Frage der Sortierer als naechste stellt - und vor allem: welche er
 * NICHT stellt.
 *
 * Jürgens Vorgabe war "eine Frage nach der anderen". Die eigentliche Arbeit
 * steckt aber im Weglassen: Wer bei dreissig Bildern dreissig Fragen
 * beantworten muss, nimmt wieder den Ordner auf dem Schreibtisch. Gefragt wird
 * nur, wo die Maschine wirklich nicht weiterweiss.
 *
 * Reine Funktionen ohne Datenbank: Diese Regeln sind die Stelle, an der das
 * Werkzeug zum Fragebogen wird - sie muessen ohne laufendes System pruefbar
 * sein.
 */

export interface SortierDokument {
  id: string;
  name: string;
  documentType: DocumentType | null;
  /** Gesetzt, sobald die Seite in einem Buendel aufgegangen ist - dann ist sie erledigt. */
  zusammengefuegtInId: string | null;
  /** Gehoert die Seite zu einem Buendelvorschlag? */
  vorschlagId: string | null;
  /** false = kein lesbarer Text. Ein Typ ohne Text ist geraten. */
  readable: boolean | null;
  /**
   * Hat der Berater ueber diese Seite bereits entschieden?
   *
   * Ohne dieses Feld fragt der Sortierer eine Seite, die der Nutzer gerade
   * als "eigenes Dokument" bestaetigt hat, in der naechsten Runde erneut -
   * sie hat ja immer noch keinen erkannten Typ. Eine Frage, die trotz Antwort
   * wiederkommt, ist das Ende des Vertrauens in das Werkzeug.
   */
  entschieden: boolean;
}

export interface SortierBuendel {
  id: string;
  titel: string;
  seitenIds: string[];
  /** Hat der Berater darueber schon entschieden (bestaetigt oder verworfen)? */
  entschieden: boolean;
}

/** Ein moegliches Ziel fuer eine lose Seite. */
export interface Ziel {
  id: string;
  titel: string;
}

export type Frage =
  | {
      art: "buendel";
      buendelId: string;
      titel: string;
      /** Die Seiten in ihrer Reihenfolge - der Berater sieht sie nebeneinander. */
      seiten: Array<{ id: string; name: string }>;
    }
  | {
      art: "seite";
      documentId: string;
      name: string;
      /** Was die KI vermutet hat, oder null. Wird als Vorschlag gezeigt, nie gesetzt. */
      vermutung: DocumentType | null;
      /** Wohin die Seite wandern kann: die bereits gebildeten Dokumente. */
      ziele: Ziel[];
    };

/** Ist diese Seite noch in Arbeit - also weder aufgegangen noch erledigt? */
function offen(d: SortierDokument): boolean {
  return d.zusammengefuegtInId === null;
}

/**
 * Braucht diese lose Seite eine Entscheidung?
 *
 * Ja, wenn kein Typ erkannt wurde - oder wenn zwar einer dasteht, die Seite
 * aber keinen lesbaren Text hat. Der zweite Fall ist die teuer gelernte
 * Lektion aus `falsches-gruen`: Ein Typ ohne Text ist geraten, und geraten
 * sieht auf dem Bildschirm genauso gruen aus wie gewusst.
 */
function brauchtEntscheidung(d: SortierDokument): boolean {
  if (!offen(d)) return false;
  if (d.entschieden) return false;
  // Seiten eines noch offenen Buendelvorschlags werden ueber das Buendel
  // gefragt, nicht einzeln - sonst stellt der Sortierer dieselbe Frage zweimal.
  if (d.vorschlagId) return false;
  if (d.readable === false) return true;
  return d.documentType === null;
}

/** Die Ziele, in die eine lose Seite wandern kann: fertig gebildete Dokumente. */
function ziele(dokumente: SortierDokument[]): Ziel[] {
  const gesehen = new Map<string, Ziel>();
  for (const d of dokumente) {
    if (d.zusammengefuegtInId && !gesehen.has(d.zusammengefuegtInId)) {
      gesehen.set(d.zusammengefuegtInId, { id: d.zusammengefuegtInId, titel: d.name });
    }
  }
  return [...gesehen.values()];
}

/**
 * Die naechste Frage - oder null, wenn nichts mehr zu entscheiden ist.
 *
 * Reihenfolge: erst die Buendel, dann die losen Seiten. Das ist keine
 * Geschmacksfrage. Die Buendel bilden die Dokumente, in die eine lose Seite
 * ueberhaupt einsortiert werden kann; andersherum muesste der Berater eine
 * Seite zuordnen, bevor er die Ziele kennt.
 */
export function naechsteFrage(
  dokumente: SortierDokument[],
  buendel: SortierBuendel[]
): Frage | null {
  const nachName = new Map(dokumente.map((d) => [d.id, d.name]));

  const offenesBuendel = buendel.find((b) => !b.entschieden);
  if (offenesBuendel) {
    return {
      art: "buendel",
      buendelId: offenesBuendel.id,
      titel: offenesBuendel.titel,
      seiten: offenesBuendel.seitenIds.map((id) => ({ id, name: nachName.get(id) ?? id })),
    };
  }

  const lose = dokumente.find(brauchtEntscheidung);
  if (lose) {
    return {
      art: "seite",
      documentId: lose.id,
      name: lose.name,
      vermutung: lose.documentType,
      ziele: ziele(dokumente),
    };
  }

  return null;
}

/**
 * Wie viele Fragen insgesamt noch offen sind.
 *
 * Nur fuer die Fortschrittsanzeige - "Frage 3 von 7". Ohne sie weiss der
 * Berater bei einem grossen Stapel nicht, ob er nach zwei Antworten fertig
 * ist oder nach zwanzig, und bricht im Zweifel ab.
 */
export function offeneFragen(dokumente: SortierDokument[], buendel: SortierBuendel[]): number {
  return buendel.filter((b) => !b.entschieden).length + dokumente.filter(brauchtEntscheidung).length;
}
