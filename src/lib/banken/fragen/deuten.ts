import { alleKriterien } from "../kategorien";
import { normalisiere, passtZurSuche } from "../suche";

/** Mehr als drei Kriterien beantworten keine Frage mehr, sie verwaessern sie. */
export const MAX_KRITERIEN = 3;

/**
 * Behaelt nur Kriteriennamen, die wirklich im Katalog stehen.
 *
 * Ein Sprachmodell, das einen Namen leicht daneben trifft ("Sprachkenntnisse"
 * statt "Sprache"), wuerde sonst eine leere Abfrage erzeugen und die Antwort
 * still auf null Treffer laufen lassen. Lieber verwerfen und ins Auffangnetz
 * der Stichwoerter fallen.
 */
export function pruefeKriterien(namen: string[], max = MAX_KRITERIEN): string[] {
  const katalog = new Map(alleKriterien().map((k) => [k.toLowerCase(), k]));
  const gesehen = new Set<string>();
  const behalten: string[] = [];

  for (const roh of namen ?? []) {
    const treffer = katalog.get(String(roh ?? "").trim().toLowerCase());
    if (!treffer || gesehen.has(treffer)) continue;
    gesehen.add(treffer);
    behalten.push(treffer);
    if (behalten.length >= max) break;
  }
  return behalten;
}

export interface BankName {
  bankId: string;
  name: string;
}

export interface BankAufloesung {
  /** Leer heisst: keine Eingrenzung (siehe `unbekannt` fuer den Grund). */
  banken: BankName[];
  /**
   * Eine Bank WURDE genannt, liess sich aber nicht aufloesen.
   *
   * Der Unterschied zu "keine Bank genannt" ist der ganze Punkt: Wer nach
   * EINER Bank fragt, will keine Marktuebersicht. Frueher fiel dieser Fall
   * stumm auf alle 664 Banken zurueck – aus einem KI-Aufruf wurden fuenfzehn,
   * und der Deckel riss zusaetzlich Texte mit.
   */
  unbekannt: boolean;
  hinweis: string | null;
}

/**
 * Die Grossbuchstaben eines Banknamens in ihrer Reihenfolge – die Abkuerzung,
 * unter der die Bank im Alltag laeuft.
 *
 * "HypoVereinsbank" ergibt "HV" – nicht "HVB", denn das B kommt aus dem
 * kleingeschriebenen "bank". Taugt deshalb NICHT als Treffer-Regel, wohl aber
 * als Hinweis fuer die Vorschlagsliste: "hvb" faengt mit "hv" an.
 */
function abkuerzung(name: string): string {
  return (name.match(/[A-ZÄÖÜ]/g) ?? []).join("").toLowerCase();
}

/** Nur Buchstaben und Ziffern – "H.V.B." und "HVB" sollen dasselbe sein. */
function blank(s: string): string {
  return s.toLowerCase().replace(/[^a-zäöüß0-9]/g, "");
}

/** Kommt der Name als eigenes Wort im Banknamen vor (nicht mitten drin)? */
function alsWort(name: string, gesucht: string): boolean {
  const n = normalisiere(gesucht).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!n) return false;
  return new RegExp(`(^|[^a-z0-9])${n}([^a-z0-9]|$)`).test(normalisiere(name));
}

/**
 * Loest den von der KI genannten Banknamen deterministisch gegen den Bestand
 * auf.
 *
 * Die KI darf die ABSICHT erkennen ("die ING" ist eine Bank, "welche Banken"
 * ist keine); welcher Datensatz gemeint ist, entscheidet der Code. Sonst
 * antwortet das Wiki fuer eine Bank, die es gar nicht gibt.
 *
 * In drei Stufen, und das ist hier der springende Punkt: Der Teilstringtreffer
 * der Bankensuche taugt fuer ein Suchfeld, in dem man den Treffer sieht und
 * anklickt – nicht fuer eine automatische Aufloesung. "ING" steckt auch in
 * "Ingolstadt", "Thueringen" und "Geiselhoering"; eine Frage nach EINER Bank
 * wurde damit gegen 41 Banken beantwortet. Deshalb zuerst der exakte Name,
 * dann das ganze Wort, und erst zuletzt der Teilstring.
 */
export function loeseBank(gesucht: string | null, alle: BankName[]): BankAufloesung {
  const name = (gesucht ?? "").trim();
  if (!name) return { banken: [], unbekannt: false, hinweis: null };

  const gesuchtNorm = normalisiere(name);
  const stufen = [
    (b: BankName) => normalisiere(b.name) === gesuchtNorm,
    (b: BankName) => alsWort(b.name, name),
    (b: BankName) => passtZurSuche(b.name, name),
  ];
  const treffer =
    stufen.map((passt) => alle.filter(passt)).find((t) => t.length > 0) ?? [];

  if (treffer.length === 0) {
    const naehe = aehnlicheBanken(name, alle);
    return {
      banken: [],
      unbekannt: true,
      hinweis:
        `„${name}“ finde ich im Wiki nicht.` +
        (naehe.length > 0 ? ` Meintest du: ${naehe.map((b) => b.name).join(", ")}?` : "") +
        " Stell die Frage ohne Banknamen, dann durchsuche ich alle Banken.",
    };
  }
  if (treffer.length === 1) {
    return { banken: treffer, unbekannt: false, hinweis: null };
  }
  return {
    banken: treffer,
    unbekannt: false,
    hinweis: `„${name}“ passt auf ${treffer.length} Banken – die Antwort ist auf diese eingegrenzt.`,
  };
}

/**
 * Banken, die dem gesuchten Namen nahekommen – als Vorschlag, wenn die
 * Aufloesung scheitert.
 *
 * Bewusst simpel und ohne Bibliothek: Ein Vorschlag muss nicht perfekt sein,
 * er muss den naechsten Versuch abkuerzen.
 */
export function aehnlicheBanken(gesucht: string, alle: BankName[], max = 4): BankName[] {
  const g = normalisiere(gesucht);
  const gk = blank(gesucht);
  if (gk.length < 2) return [];
  const worte = g.split(/\s+/).filter((w) => w.length >= 4);

  const punkte = (b: BankName): number => {
    const n = normalisiere(b.name);
    const a = abkuerzung(b.name);
    let p = 0;
    if (a.length >= 2 && (a.startsWith(gk) || gk.startsWith(a))) p += 4;
    if (n.startsWith(g.slice(0, 3))) p += 2;
    for (const w of worte) if (n.includes(w)) p += 3;
    return p;
  };

  return alle
    .map((b) => ({ b, p: punkte(b) }))
    .filter((x) => x.p > 0)
    .sort((x, y) => y.p - x.p || x.b.name.localeCompare(y.b.name, "de"))
    .slice(0, max)
    .map((x) => x.b);
}

/**
 * Nimmt die von der KI gewaehlte bankId nur an, wenn sie wirklich in der
 * vorgelegten Liste steht. Ohne diese Pruefung koennte die Auswahl eine
 * Kennung erfinden, und die Antwort liefe gegen eine Bank, die es nicht gibt.
 */
export function waehleAusKandidaten(
  bankId: string | null | undefined,
  kandidaten: BankName[]
): BankName | null {
  if (!bankId) return null;
  return kandidaten.find((k) => k.bankId === bankId) ?? null;
}

/** Wörter, die in einer Frage stehen, aber nie im Freitext einer Bank helfen. */
const FRAGEWOERTER = new Set([
  "welche", "welcher", "welches", "banken", "bank", "nimmt", "nehmen",
  "akzeptiert", "akzeptieren", "finanziert", "finanzieren", "erlaubt",
  "moeglich", "geht", "gibt", "eine", "einen", "einem", "eines", "wird",
  "werden", "kann", "koennen", "auch", "noch", "beim", "unter", "ihrer",
  "ihre", "dieser", "diese", "sein", "sind", "hat", "haben",
]);

/**
 * Stichwoerter aus der Frage ableiten – deterministisch, ohne KI.
 *
 * Notwendig, weil das Modell die Stichwoerter mal liefert und mal nicht: Die
 * Marktfrage nach der befristeten Aufenthaltsgenehmigung kam ohne zurueck, und
 * ohne Kriterium UND ohne Stichwort hatte die Suche gar keinen Ansatzpunkt –
 * "dazu steht nichts im Bestand", obwohl 86 Banken das Thema erwaehnen.
 */
export function stichwoerterAusFrage(frage: string, max = 5): string[] {
  const gesehen = new Set<string>();
  const raus: string[] = [];
  for (const wort of (frage ?? "").split(/[^A-Za-zÄÖÜäöüß0-9-]+/)) {
    if (wort.length < 5) continue;
    const schluessel = normalisiere(wort);
    if (FRAGEWOERTER.has(schluessel) || gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    raus.push(wort);
    if (raus.length >= max) break;
  }
  return raus;
}
