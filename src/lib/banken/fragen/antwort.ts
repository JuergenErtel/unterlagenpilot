import { URTEILE, type Urteil } from "./schema";
import type { Textblock, Zeile } from "./sammeln";

export interface BankUrteil {
  bankId: string;
  name: string;
  /** Aus welchem Kriterium das Urteil stammt – der Unterschied bleibt sichtbar. */
  kriterium: string;
  /** Geprueftes woertliches Zitat, oder null. */
  beleg: string | null;
  /** Textanfang als Ersatz, wenn kein geprueftes Zitat vorliegt. */
  auszug: string;
}

export interface Gruppe {
  urteil: Urteil;
  banken: BankUrteil[];
}

/**
 * Welches Urteil gewinnt, wenn eine Bank ueber mehrere Kriterien verschieden
 * antwortet. Ein Nein an einer Stelle bleibt ein Nein – die Antwort soll den
 * Vermittler nicht in ein Gespraech schicken, das an anderer Stelle scheitert.
 */
const RANG: Record<Urteil, number> = { nein: 3, bedingt: 2, ja: 1, keine_aussage: 0 };

const AUSZUG_LAENGE = 200;

function auszugAus(text: string): string {
  return text.length <= AUSZUG_LAENGE ? text : text.slice(0, AUSZUG_LAENGE).trimEnd() + "…";
}

export interface Gruppierung {
  gruppen: Gruppe[];
  /** Zeilen, deren Text kein Urteil bekommen hat (KI-Buendel fehlgeschlagen). */
  ungelesen: Zeile[];
}

/**
 * Bildet die Urteile je Text auf die Banken zurueck und sortiert sie in die
 * vier Gruppen.
 *
 * Jede Bank erscheint genau einmal – sonst zaehlt die Ueberschrift "12 Banken"
 * Zeilen statt Instituten und die Antwort wird groesser, als der Bestand
 * hergibt.
 */
export function baueGruppen(
  bloecke: Textblock[],
  urteile: Map<number, { urteil: Urteil; beleg: string | null }>,
  ohneAussage: Zeile[],
  /**
   * Die Kriterien, die zur Frage gedeutet wurden. Bei gleichem Urteil gewinnt
   * eine Zeile daraus – sonst belegt die Antwort ein Nein mit einem Nebensatz
   * aus einem Kriterium, das nur ueber das Stichwort-Auffangnetz hereinkam.
   */
  primaerKriterien: string[] = []
): Gruppierung {
  const primaer = new Set(primaerKriterien);
  const beste = new Map<string, { urteil: Urteil; eintrag: BankUrteil }>();
  const ungelesen: Zeile[] = [];

  /** Je hoeher, desto eher zeigt die Antwort diese Zeile. */
  const gewicht = (urteil: Urteil, eintrag: BankUrteil): number =>
    RANG[urteil] * 4 + (primaer.has(eintrag.kriterium) ? 2 : 0) + (eintrag.beleg ? 1 : 0);

  const merke = (urteil: Urteil, eintrag: BankUrteil) => {
    const bisher = beste.get(eintrag.bankId);
    if (bisher && gewicht(bisher.urteil, bisher.eintrag) >= gewicht(urteil, eintrag)) return;
    beste.set(eintrag.bankId, { urteil, eintrag });
  };

  for (const block of bloecke) {
    const bewertung = urteile.get(block.id);
    if (!bewertung) {
      // Das Buendel ist nicht durchgelaufen. Nicht als "keine Aussage"
      // ausgeben – die Bank hat etwas gesagt, wir haben es nur nicht gelesen.
      ungelesen.push(...block.banken);
      continue;
    }
    for (const z of block.banken) {
      merke(bewertung.urteil, {
        bankId: z.bankId,
        name: z.name,
        kriterium: z.kriterium,
        beleg: bewertung.beleg,
        auszug: auszugAus(block.text),
      });
    }
  }

  // "Hat sich nicht geaeussert" ist nur unter einem GEFRAGTEN Kriterium eine
  // Aussage. Eine Zeile ohne Inhalt traegt kein Wort, an dem sich Bezug zur
  // Frage pruefen liesse – ihr Kriterium ist der einzige Anhaltspunkt.
  //
  // Ohne diese Sperre fuellte die Gruppe sich mit Beifang: Bei der Frage nach
  // der befristeten Aufenthaltsgenehmigung standen dort Banken zum Merkmal
  // "befristete Arbeitsvertraege" – hereingekommen ueber die BEZEICHNUNG des
  // Produktmerkmals, nicht ueber einen Text zum Thema. Wurde kein Kriterium
  // gedeutet, bleibt die Gruppe leer; der Hinweis sagt dann ausdruecklich,
  // dass schweigende Banken ganz fehlen.
  for (const z of ohneAussage) {
    if (!primaer.has(z.kriterium)) continue;
    merke("keine_aussage", {
      bankId: z.bankId,
      name: z.name,
      kriterium: z.kriterium,
      beleg: null,
      auszug: "",
    });
  }

  return {
    gruppen: URTEILE.map((urteil) => ({
      urteil,
      banken: [...beste.values()]
        .filter((b) => b.urteil === urteil)
        .map((b) => b.eintrag)
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    })),
    ungelesen,
  };
}
