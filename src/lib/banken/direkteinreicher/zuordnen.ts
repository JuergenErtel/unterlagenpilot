import { kanonisch } from "../suche";
import zuordnung from "./zuordnung.json";

/**
 * Ordnet einen Wiki-Artikel "<Bank> - Direkteinreicherinformationen" einer
 * Bank aus dem Kriteriencheck zu.
 *
 * Anders als bei den 28 Produktuebersichten (Zuordnung von Hand) sind es hier
 * Hunderte Artikel – und die Namen unterscheiden sich fast nur in der
 * Kurzform: "Sparkasse Ulm" gegen "Spk Ulm". Deshalb EXAKTER Vergleich der
 * Vergleichsform (siehe `kanonisch`), nie Teilstring: "L-Bank" traf per
 * Teilstring 356 Banken, "Hannoversche" die falsche.
 */

export interface BankKandidat {
  id: string;
  name: string;
}

/** "Sparkasse Ulm - Direkteinreicherinformationen" → "Sparkasse Ulm"; null, wenn kein solcher Artikel. */
export function bankNameAusTitel(titel: string): string | null {
  const m = /^(.*?)\s*[-–—:|]\s*Direkteinreicher/i.exec(titel.trim());
  if (!m) return null;
  const name = (m[1] ?? "").trim();
  return name || null;
}

/** Rechtsform und Fuellwoerter raus – "Volksbank Ulm eG" und "VoBa Ulm" sind dieselbe Bank. */
export function vergleichsname(name: string): string {
  return kanonisch(name)
    .replace(/\b(eg|e\.g\.|ag|kg|gmbh|mbh|se|adoer|a\.oe\.r\.)\b/g, " ")
    .replace(/[.,;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VON_HAND: Record<string, string> = zuordnung.aufVorhandeneBank;

export function ordneZu(artikelName: string, banken: BankKandidat[]): BankKandidat | null {
  const vonHand = VON_HAND[artikelName];
  if (vonHand) return banken.find((b) => b.name === vonHand) ?? null;

  const ziel = vergleichsname(artikelName);
  if (!ziel) return null;
  const treffer = banken.filter((b) => vergleichsname(b.name) === ziel);
  // Zwei Banken mit derselben Vergleichsform: nicht raten.
  return treffer.length === 1 ? (treffer[0] ?? null) : null;
}
