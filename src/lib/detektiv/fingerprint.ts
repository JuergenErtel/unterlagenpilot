import { createHash } from "node:crypto";
import type { DocReference, FindingCode } from "./types";

/**
 * Urkundennummer auf die reine Kennung reduzieren: "UR-Nr. 789 / 2011",
 * " UR 789 / 2011 " und "789/2011" fuehren alle auf "789/2011".
 *
 * Hier zentral, damit Fingerabdruck und Abgleich (match.ts) garantiert
 * dieselbe Vorstellung davon haben, wann zwei Nummern gleich sind. Weichen die
 * beiden voneinander ab, entstehen Befunde, die sich nie schliessen lassen.
 */
export function normUrkundenNummer(value: string | null): string | null {
  if (!value) return null;
  const ohnePraefix = value.toLowerCase().trim().replace(/^ur[-\s.]*(nr\.?)?/, "");
  const kompakt = ohnePraefix.replace(/\s+/g, "");
  return kompakt || null;
}

/** Umlaute aufloesen und alles Nicht-Alphanumerische entfernen. */
export function normText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Kennung einer Urkunde fuer den Fingerabdruck. Vorrang: Urkundennummer, dann
 * Datum, dann normalisiertes Label. Bewusst OHNE Zitat, Seitenzahl und
 * Confidence – die aendern sich bei einer erneuten Extraktion, und ein Befund
 * darf dadurch nicht zu einem neuen Befund werden.
 */
export function refKeyOf(
  ref: Pick<DocReference, "urkundenNummer" | "urkundeDatum" | "label">
): string {
  const nr = normUrkundenNummer(ref.urkundenNummer);
  if (nr) return `ur:${nr}`;
  if (ref.urkundeDatum) return `dat:${ref.urkundeDatum}`;
  return `lab:${normText(ref.label)}`;
}

/** Stabiler Fingerabdruck eines Befunds. Traegt den Unique-Index je Fall. */
export function fingerprint(input: {
  sourceDocumentId: string;
  code: FindingCode;
  refKey: string;
}): string {
  return createHash("sha256")
    .update(`${input.sourceDocumentId}|${input.code}|${input.refKey}`)
    .digest("hex")
    .slice(0, 32);
}
