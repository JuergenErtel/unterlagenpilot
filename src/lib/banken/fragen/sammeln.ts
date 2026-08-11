import { nurText } from "../bereinigen";
import { normalisiere } from "../suche";

/** Eine Kriteriumszeile einer Bank, so wie sie aus der Datenbank kommt. */
export interface Zeile {
  bankId: string;
  name: string;
  kriterium: string;
  status: string;
  /** Bereinigtes HTML (siehe bereinigen.ts). */
  inhalt: string;
}

/**
 * Ein Freitext unter EINEM Kriterium und alle Banken, die ihn tragen.
 *
 * Das Kriterium gehoert zwingend dazu: Viele Bestandstexte sind elliptisch
 * ("Wird von der Bank nicht unterstuetzt.", "deutsch"). Ohne den Namen des
 * Kriteriums laesst sich nicht sagen, WAS nicht unterstuetzt wird – gegen die
 * echte KI gemessen fiel genau so die klarste Absage der ING durch, weil der
 * Satz ohne Kontext nichts aussagt.
 */
export interface Textblock {
  id: number;
  kriterium: string;
  text: string;
  banken: Zeile[];
}

export interface Sammlung {
  /** Zu bewertende Bloecke – bereits gedeckelt und nach Stichwortnaehe sortiert. */
  bloecke: Textblock[];
  /** Zeilen ohne Aussage der Bank. Erreichen die KI nie. */
  ohneAussage: Zeile[];
  /** Zeilen, deren Block dem Deckel zum Opfer fiel. Werden ausgewiesen, nicht verschwiegen. */
  ungelesen: Zeile[];
  /** Anzahl verschiedener Texte VOR dem Deckel. */
  gesamtBloecke: number;
}

/**
 * Wieviele verschiedene Texte hoechstens gelesen werden.
 *
 * Im Median hat ein Kriterium 192 verschiedene Texte, im schlimmsten Fall 542
 * (~52k Tokens). 542 wuerden das Minutenfenster des Anbieters sprengen und die
 * Wartezeit ueber zwei Minuten treiben. 300 deckt den Median mit Luft ab; was
 * darueber liegt, wird gemeldet statt still abgeschnitten.
 */
export const DECKEL = 300;

/** Der Satz, den Europace fuer "keine Angabe" einsetzt – ohne jeden Inhalt. */
const KEINE_AUSSAGE = "KEINE_ANGABE";

/**
 * Macht aus Zeilen bewertbare Textbloecke.
 *
 * Zwei Dinge passieren hier, und beide sind der Grund, warum das Feature
 * ueberhaupt bezahlbar ist:
 *
 * 1. `KEINE_ANGABE` fliegt raus. Alle 21.006 solchen Zeilen im Bestand tragen
 *    denselben Platzhaltersatz ("Es liegt noch keine Information seitens der
 *    Bank vor") – es gibt dort nichts zu lesen. Sie landen in `ohneAussage`
 *    und werden spaeter als "hat sich nicht geaeussert" gezeigt, nie als Nein.
 * 2. Gleiche Texte werden zusammengefasst. 664 Zeilen zum Kriterium "Sprache"
 *    sind nur 193 verschiedene Texte; bewertet wird der Text, nicht die Bank.
 */
export function buendele(
  zeilen: Zeile[],
  stichwoerter: string[] = [],
  deckel = DECKEL,
  /**
   * Die zur Frage gedeuteten Kriterien. Ihre Texte werden ZUERST gelesen.
   *
   * Ohne diesen Vorrang frisst das Stichwort-Auffangnetz den Deckel auf: Die
   * Frage nach Kurzarbeitergeld zog ueber das Wort "Einkommen" 721 Texte quer
   * durch alle Kriterien herein, und ausgerechnet Texte des gefragten
   * Kriteriums blieben ungelesen.
   */
  primaerKriterien: string[] = []
): Sammlung {
  const primaer = new Set(primaerKriterien);
  const ohneAussage: Zeile[] = [];
  const nachText = new Map<string, { kriterium: string; text: string; banken: Zeile[] }>();

  for (const z of zeilen) {
    const text = nurText(z.inhalt);
    // Ohne Status-Aussage oder ohne Text gibt es nichts zu lesen.
    if (z.status === KEINE_AUSSAGE || text === "") {
      ohneAussage.push(z);
      continue;
    }
    // Zusammengefasst wird je Kriterium: derselbe Satz bedeutet unter einem
    // anderen Kriterium etwas anderes.
    const schluessel = `${z.kriterium}\u0000${normalisiere(text)}`;
    const vorhanden = nachText.get(schluessel);
    if (vorhanden) vorhanden.banken.push(z);
    else nachText.set(schluessel, { kriterium: z.kriterium, text, banken: [z] });
  }

  const worte = stichwoerter
    .map((s) => normalisiere(s))
    .filter((s) => s.length >= 3);

  const sortiert = [...nachText.entries()]
    .map(([schluessel, eintrag]) => ({
      ...eintrag,
      istPrimaer: primaer.has(eintrag.kriterium),
      naehe: worte.filter((w) => schluessel.includes(w)).length,
    }))
    // Gefragtes Kriterium zuerst, dann Stichworttreffer, dann die Texte, die
    // viele Banken tragen. Der Textvergleich am Ende macht die Reihenfolge
    // reproduzierbar.
    .sort(
      (a, b) =>
        Number(b.istPrimaer) - Number(a.istPrimaer) ||
        b.naehe - a.naehe ||
        b.banken.length - a.banken.length ||
        a.text.localeCompare(b.text, "de")
    );

  const behalten = sortiert.slice(0, Math.max(0, deckel));
  const ungelesen = sortiert.slice(behalten.length).flatMap((e) => e.banken);

  return {
    bloecke: behalten.map((e, i) => ({
      id: i + 1,
      kriterium: e.kriterium,
      text: e.text,
      banken: e.banken,
    })),
    ohneAussage,
    ungelesen,
    gesamtBloecke: sortiert.length,
  };
}
