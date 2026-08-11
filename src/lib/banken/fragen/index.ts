import { aiService } from "@/lib/ai";
import { alleKriterien } from "../kategorien";
import {
  aehnlicheBanken,
  loeseBank,
  pruefeKriterien,
  stichwoerterAusFrage,
  waehleAusKandidaten,
} from "./deuten";
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
  // Ohne Kriterium sind die Stichwoerter die einzige Spur – und das Modell
  // liefert sie nicht zuverlaessig. Dann werden sie aus der Frage abgeleitet,
  // statt die Suche ohne Ansatzpunkt loslaufen zu lassen.
  const ausKi = deutung.stichwoerter.filter((s) => s.trim().length >= 3);
  const stichwoerter = ausKi.length > 0 ? ausKi : stichwoerterAusFrage(text);
  const hinweise: string[] = [];

  const alleBanken = await bestand.bankNamen();
  let aufloesung = loeseBank(deutung.bank, alleBanken);

  // Abkuerzungen wie "HVB" fuehrt der Bestand als "HypoVereinsbank". Lokal ist
  // das nicht zu loesen – gegen die echten Namen gemessen trifft "HVB" fuenf
  // Banken, "KSK" achtundfuenfzig. Deshalb EIN kleiner Auswahl-Aufruf mit den
  // naechstliegenden Kandidaten, und nur wenn die Aufloesung gescheitert ist.
  if (aufloesung.unbekannt && deutung.bank) {
    const kandidaten = aehnlicheBanken(deutung.bank, alleBanken, 8);
    if (kandidaten.length > 0) {
      try {
        const wahl = await aiService.waehleBank(deutung.bank, kandidaten);
        const bank = waehleAusKandidaten(wahl.bankId, kandidaten);
        if (bank) {
          aufloesung = { banken: [bank], unbekannt: false, hinweis: null };
          hinweise.push(`„${deutung.bank}“ verstanden als ${bank.name}.`);
        }
      } catch (err) {
        console.error(
          "[banken-fragen] Bankauswahl fehlgeschlagen:",
          err instanceof Error ? err.message : "unbekannter Fehler"
        );
      }
    }
  }

  if (aufloesung.hinweis) hinweise.push(aufloesung.hinweis);

  // Genannte, aber unbekannte Bank: hier ist Schluss. Frueher lief die Frage
  // stumm gegen alle 664 Banken weiter – das beantwortet eine ANDERE Frage als
  // die gestellte, dauert fuenfzehn KI-Aufrufe statt einem und reisst durch
  // den Deckel noch Texte mit. Eine Rueckfrage ist schneller und ehrlicher.
  if (aufloesung.unbekannt) {
    return {
      ...leereAntwort(text, hinweise),
      verstanden: deutung.verstanden,
      kriterien,
      stichwoerter,
    };
  }

  if (kriterien.length === 0 && stichwoerter.length > 0) {
    // Das Wiki hat fuer dieses Thema kein Fach. Genau daran ist die Frage nach
    // der befristeten Aufenthaltsgenehmigung aufgelaufen: Der Katalog kennt
    // kein Kriterium zu Staatsangehoerigkeit oder Aufenthaltstitel, also
    // stuetzte sich die Antwort auf "Wohnsitz" – wo es um Expatriates geht.
    //
    // Zwei Dinge muessen deshalb hier stehen, und zwar beide:
    // dass ohne Kriterium nur nach Woertern gesucht wurde (die Treffer koennen
    // ein anderes Thema betreffen), und dass die schweigenden Banken deshalb
    // ganz fehlen. "Keine Aussage" heisst hier nicht "abgelehnt".
    hinweise.push(
      `Das Wiki führt kein Kriterium zu diesem Thema. Gesucht wurde nur im Freitext nach ${stichwoerter
        .map((s) => `„${s}“`)
        .join(", ")} — die Treffer können etwas anderes meinen, und Banken, die sich dazu nicht geäußert haben, fehlen ganz.`
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
