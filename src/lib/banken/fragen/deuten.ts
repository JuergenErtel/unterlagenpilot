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
  /** Leer heisst: keine Eingrenzung, die Antwort deckt alle Banken ab. */
  banken: BankName[];
  hinweis: string | null;
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
  if (!name) return { banken: [], hinweis: null };

  const gesuchtNorm = normalisiere(name);
  const stufen = [
    (b: BankName) => normalisiere(b.name) === gesuchtNorm,
    (b: BankName) => alsWort(b.name, name),
    (b: BankName) => passtZurSuche(b.name, name),
  ];
  const treffer =
    stufen.map((passt) => alle.filter(passt)).find((t) => t.length > 0) ?? [];

  if (treffer.length === 0) {
    return {
      banken: [],
      hinweis: `„${name}“ ist im Wiki nicht bekannt – die Antwort deckt alle Banken ab.`,
    };
  }
  if (treffer.length === 1) {
    return { banken: treffer, hinweis: null };
  }
  return {
    banken: treffer,
    hinweis: `„${name}“ passt auf ${treffer.length} Banken – die Antwort ist auf diese eingegrenzt.`,
  };
}
