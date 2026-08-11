import { aiService } from "@/lib/ai";
import { alleKriterien } from "../kategorien";
import { loeseBank, pruefeKriterien } from "./deuten";
import { buendele, DECKEL, type Zeile } from "./sammeln";
import {
  BUENDEL_GROESSE,
  GLEICHZEITIG,
  fuerPrompt,
  inBuendel,
  parallelBegrenzt,
  pruefeBeleg,
} from "./lesen";
import { baueGruppen, type Gruppe } from "./antwort";
import type { Urteil } from "./schema";
import { prismaBestand, type Bestand } from "./bestand";

export type { Gruppe, BankUrteil } from "./antwort";
export type { Urteil } from "./schema";

export interface FrageAntwort {
  frage: string;
  /** Wie die KI die Frage verstanden hat – macht Fehldeutungen sichtbar. */
  verstanden: string;
  kriterien: string[];
  stichwoerter: string[];
  /** Wann der Bestand von Europace geholt wurde. */
  standAm: Date | null;
  gruppen: Gruppe[];
  /** Gelesene und insgesamt vorhandene verschiedene Texte. */
  gelesen: number;
  gesamt: number;
  /** Banken, deren Aussage nicht ausgewertet wurde (Deckel oder Fehlschlag). */
  nichtGelesen: number;
  hinweise: string[];
  /** Nichts Passendes im Bestand – Fehlanzeige statt Rateliste. */
  fehlanzeige: boolean;
}

export const MIN_LAENGE = 3;
export const MAX_LAENGE = 300;

function leereAntwort(frage: string, hinweise: string[]): FrageAntwort {
  return {
    frage,
    verstanden: "",
    kriterien: [],
    stichwoerter: [],
    standAm: null,
    gruppen: [],
    gelesen: 0,
    gesamt: 0,
    nichtGelesen: 0,
    hinweise,
    fehlanzeige: true,
  };
}

/**
 * Beantwortet eine Frage in Alltagssprache gegen den Bestand des Banken-Wikis.
 *
 * Vier Stufen: deuten (KI, klein) – sammeln und entdoppeln (Code) – lesen
 * (KI, gebuendelt, mit Belegpruefung) – gruppieren (Code). Was die KI
 * behauptet, wird nie ungeprueft angezeigt: Kriteriennamen muessen im Katalog
 * stehen, Zitate im Quelltext.
 */
export async function beantworteFrage(
  frage: string,
  bestand: Bestand = prismaBestand
): Promise<FrageAntwort> {
  const text = (frage ?? "").trim();
  if (text.length < MIN_LAENGE) {
    return leereAntwort(text, ["Die Frage ist zu kurz."]);
  }
  if (text.length > MAX_LAENGE) {
    return leereAntwort(text.slice(0, MAX_LAENGE), [
      `Die Frage ist länger als ${MAX_LAENGE} Zeichen. Bitte kürzer fassen.`,
    ]);
  }

  const deutung = await aiService.deuteBankenFrage(text, alleKriterien());
  const kriterien = pruefeKriterien(deutung.kriterien);
  const stichwoerter = deutung.stichwoerter.filter((s) => s.trim().length >= 3);
  const hinweise: string[] = [];

  const aufloesung = loeseBank(deutung.bank, await bestand.bankNamen());
  if (aufloesung.hinweis) hinweise.push(aufloesung.hinweis);

  if (kriterien.length === 0 && stichwoerter.length > 0) {
    // Wichtig fuer die Ehrlichkeit der Antwort: Ohne Kriterium kommen nur
    // Zeilen zurueck, in denen das Stichwort woertlich vorkommt. Banken, die
    // sich zu dem Thema gar nicht geaeussert haben, tauchen dann nirgends auf
    // – die Antwort deckt also NICHT den ganzen Markt ab, auch wenn sie so
    // aussieht.
    hinweise.push(
      `Kein Kriterium erkannt – gesucht wurde nur im Freitext nach: ${stichwoerter.join(", ")}. ` +
        "Banken, die sich dazu nicht geäußert haben, fehlen in dieser Antwort."
    );
  }

  const zeilen = await bestand.zeilen(
    kriterien,
    stichwoerter,
    aufloesung.banken.length > 0 ? aufloesung.banken.map((b) => b.bankId) : null
  );
  if (zeilen.length === 0) {
    return {
      ...leereAntwort(text, [
        ...hinweise,
        "Dazu steht nichts im Bestand. Formuliere die Frage mit anderen Worten oder schlag das Kriterium direkt nach.",
      ]),
      verstanden: deutung.verstanden,
      kriterien,
      stichwoerter,
      standAm: await bestand.abzugStand(),
    };
  }

  const sammlung = buendele(zeilen, stichwoerter, DECKEL, kriterien);

  const buendel = inBuendel(sammlung.bloecke, BUENDEL_GROESSE);
  const ergebnisse = await parallelBegrenzt(buendel, GLEICHZEITIG, (gruppe) =>
    aiService.bewerteBankTexte(
      text,
      gruppe.map((b) => ({ id: b.id, kriterium: b.kriterium, text: fuerPrompt(b.text) }))
    )
  );
  if (ergebnisse.some((e) => e === null)) {
    hinweise.push(
      "Ein Teil der Texte konnte nicht gelesen werden. Die betroffenen Banken fehlen in der Auswertung."
    );
  }

  const quellen = new Map(sammlung.bloecke.map((b) => [b.id, b.text]));
  const urteile = new Map<number, { urteil: Urteil; beleg: string | null }>();
  for (const ergebnis of ergebnisse) {
    for (const u of ergebnis?.urteile ?? []) {
      const quelle = quellen.get(u.id);
      if (quelle === undefined) continue; // erfundene id – verwerfen
      urteile.set(u.id, { urteil: u.urteil, beleg: pruefeBeleg(u.beleg, quelle) });
    }
  }

  const { gruppen, ungelesen } = baueGruppen(
    sammlung.bloecke,
    urteile,
    sammlung.ohneAussage,
    kriterien
  );

  const nichtGelesen = zaehleFehlende(gruppen, [...sammlung.ungelesen, ...ungelesen]);
  if (sammlung.gesamtBloecke > sammlung.bloecke.length) {
    // Der Unterschied zaehlt: Wurde nur Beifang aus anderen Kriterien
    // liegengelassen, oder fehlen wirklich Banken in der Antwort?
    hinweise.push(
      nichtGelesen === 0
        ? `Alle Banken sind bewertet. ${sammlung.gesamtBloecke - sammlung.bloecke.length} weitere Fundstellen aus anderen Kriterien wurden nicht mehr gelesen (Deckel bei ${DECKEL}).`
        : `${sammlung.bloecke.length} von ${sammlung.gesamtBloecke} verschiedenen Texten gelesen (Deckel bei ${DECKEL}) – ${nichtGelesen} Banken fehlen dadurch. Eine engere Frage liest den Rest.`
    );
  }

  return {
    frage: text,
    verstanden: deutung.verstanden,
    kriterien,
    stichwoerter,
    standAm: await bestand.abzugStand(),
    gruppen,
    gelesen: sammlung.bloecke.length,
    gesamt: sammlung.gesamtBloecke,
    nichtGelesen,
    hinweise,
    fehlanzeige: false,
  };
}

/**
 * Banken, die in keiner Gruppe auftauchen, obwohl sie eine Aussage tragen.
 * Wird ausgewiesen statt verschwiegen – eine Antwort, die 500 Banken
 * unterschlaegt, ist schlimmer als eine, die es zugibt.
 */
function zaehleFehlende(gruppen: Gruppe[], ungelesen: Zeile[]): number {
  const gezeigt = new Set(gruppen.flatMap((g) => g.banken.map((b) => b.bankId)));
  return new Set(ungelesen.map((z) => z.bankId).filter((id) => !gezeigt.has(id))).size;
}
