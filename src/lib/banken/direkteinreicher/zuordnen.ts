import { kanonisch } from "../suche";
import zuordnung from "./zuordnung.json";
import produktZuordnung from "../produktuebersicht/zuordnung.json";

/**
 * Ordnet einen Wiki-Artikel "<Bank> - Direkteinreicherinformationen" einer
 * Bank aus dem Kriteriencheck zu.
 *
 * Anders als bei den 28 Produktuebersichten (Zuordnung von Hand) sind es hier
 * 676 Artikel – und die Namen unterscheiden sich meist nur in der Kurzform:
 * "Sparkasse Ulm" gegen "Spk Ulm", "VR-Bank X eG" gegen "VR X". Deshalb
 * zuerst EXAKTER Vergleich der Vergleichsform, nie Teilstring: "L-Bank" traf
 * per Teilstring 356 Banken, "Hannoversche" die falsche.
 *
 * Zweite Stufe ("unscharf"): Ortsworte ohne die Institutsgruppe vergleichen
 * – aber nur innerhalb derselben Gruppe (Sparkasse bleibt Sparkasse) und nur,
 * wenn genau EINE Bank passt. Jeder unscharfe Treffer wird gemeldet, damit
 * er von Hand geprueft werden kann.
 */

export interface BankKandidat {
  id: string;
  name: string;
}

export interface Zuordnung {
  bank: BankKandidat;
  /** "exakt" | "hand" | "unscharf" – unscharfe Treffer landen im Bericht. */
  art: "exakt" | "hand" | "unscharf";
}

/** "Sparkasse Ulm - Direkteinreicherinformationen" → "Sparkasse Ulm"; null, wenn kein solcher Artikel. */
export function bankNameAusTitel(titel: string): string | null {
  const m = /^(.*?)\s*(?:[-–—:|]\s*)?Direkteinreicher/i.exec(titel.trim());
  if (!m) return null;
  const name = (m[1] ?? "").replace(/[-–—:|]\s*$/, "").trim();
  return name || null;
}

/**
 * Rechtsform, Sitzangabe hinter dem Komma und Fuellwoerter raus, die
 * Genossenschaftsfamilie auf "vr" gebracht – "Volksbank Raiffeisenbank Dachau eG",
 * "VR-Bank Dachau" und "VR Dachau" sind dieselbe Bank.
 */
export function vergleichsname(name: string): string {
  let k = kanonisch(name).replace(/[·•–—]/g, " ");
  // ", Bad Reichenhall" bzw. ", Lohr am Main": Sitz hinter dem Komma faellt weg
  k = k.replace(/,.*$/, "");
  k = k
    .replace(/\b(volksbank raiffeisenbank|raiffeisen volksbank|volks und raiffeisenbank|raiffeisenbank volksbank|vr bank|rvb|vvb)\b/g, "vr")
    .replace(/\bsparda bank\b/g, "sparda")
    .replace(/\b(eg|e\.g\.|ag|kgaa|kg|gmbh|mbh|se|adoer|a\.oe\.r\.)\b/g, " ")
    .replace(/[.;:()"'/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return k;
}

const GRUPPEN: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(kreisspk|stadtspk|verbandsspk|landesspk|\w*spk)\b/, "spk"],
  [/\b(vr|volksbank|raiffeisenbank|genossenschaftsbank)\b/, "vr"],
  [/\bsparda\b/, "sparda"],
  [/\bpsd\b/, "psd"],
  [/\blbs\b/, "lbs"],
];

/** Institutsgruppe einer Vergleichsform – "sonstige", wenn keine bekannte. */
export function gruppe(v: string): string {
  for (const [re, g] of GRUPPEN) if (re.test(v)) return g;
  return "sonstige";
}

const FUELLWOERTER = new Set([
  "spk", "kreisspk", "stadtspk", "verbandsspk", "landesspk", "vr", "volksbank", "raiffeisenbank",
  "genossenschaftsbank", "sparda", "psd", "lbs", "bank", "und", "u", "im", "in", "am", "an", "der",
  "die", "das", "zu", "zur", "von", "vom", "e", "g", "vereinigte", "vereinte", "staedtische",
  "vermittlungsangebot", "vermittlerprodukt", "plattform", "digital", "eg",
]);

/** Die Worte, die den Ort tragen – ohne Institutsgruppe und Fuellwoerter. */
export function ortsworte(v: string): string[] {
  return [...new Set(v.split(" ").filter((w) => w && !FUELLWOERTER.has(w) && !/spk$/.test(w)))].sort();
}

const VON_HAND: Record<string, string> = {
  ...(produktZuordnung.aufVorhandeneBank as Record<string, string>),
  ...(zuordnung.aufVorhandeneBank as Record<string, string>),
};
/** Banken, die ein Wiki-Import unter ihrem Artikelnamen neu anlegt bzw. angelegt hat. */
const NEU_ANGELEGT: string[] = [...produktZuordnung.neueBank, ...zuordnung.neueBank];

/**
 * Artikel zu einem Anbieter, den der Kriteriencheck nicht kennt (DSL Bank,
 * Santander, Muenchener Hyp …) – von Hand freigegeben, damit kein Tippfehler
 * im Wiki eine Dublette anlegt.
 */
export function istNeueBank(artikelName: string): boolean {
  return zuordnung.neueBank.includes(artikelName);
}

export function ordneZu(artikelName: string, banken: BankKandidat[]): Zuordnung | null {
  const vonHand = VON_HAND[artikelName] ?? (NEU_ANGELEGT.includes(artikelName) ? artikelName : undefined);
  if (vonHand) {
    const b = banken.find((x) => x.name === vonHand);
    return b ? { bank: b, art: "hand" } : null;
  }

  const ziel = vergleichsname(artikelName);
  if (!ziel) return null;
  const exakt = banken.filter((b) => vergleichsname(b.name) === ziel);
  if (exakt.length === 1) return { bank: exakt[0]!, art: "exakt" };
  if (exakt.length > 1) return null; // zwei Banken mit derselben Vergleichsform: nicht raten

  const g = gruppe(ziel);
  if (g === "sonstige") return null;
  const orte = ortsworte(ziel);
  if (orte.length === 0) return null;
  const unscharf = banken.filter((b) => {
    const v = vergleichsname(b.name);
    if (gruppe(v) !== g) return false;
    const o = ortsworte(v);
    if (o.length === 0) return false;
    const [klein, gross] = o.length <= orte.length ? [o, orte] : [orte, o];
    return klein.every((w) => gross.includes(w));
  });
  return unscharf.length === 1 ? { bank: unscharf[0]!, art: "unscharf" } : null;
}
