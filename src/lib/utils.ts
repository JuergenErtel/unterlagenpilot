import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEUR(value: number | null | undefined): string {
  if (value == null) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "–";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "–";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

/** Konfidenz 0..1 -> Prozent-String */
export function formatConfidence(value: number | null | undefined): string {
  if (value == null) return "–";
  return `${Math.round(value * 100)} %`;
}

/** Feldlabels, hinter denen ein Euro-Betrag steckt (Kleinschreib-Vergleich). */
const GELD_LABEL =
  /brutto|netto|gehalt|einkommen|betrag|preis|rate|darlehen|eigenkapital|kosten|miete|hausgeld|provision|summe|kredit|restschuld/i;

/**
 * Anzeige-Formatierung eines KI-erkannten Feldwerts.
 *
 * Nur die ANZEIGE: Gespeichert und korrigiert wird immer der Rohwert. Ein
 * nacktes "4200" neben "360.000 €" an anderer Stelle sah nach zwei
 * verschiedenen Apps aus. Formatiert wird bewusst eng: nur wenn das Label
 * nach Geld klingt UND der Wert eine reine Zahl ist – ein Datum, eine IBAN
 * oder "3 Zimmer" bleiben unangetastet.
 */
export function formatFeldwert(label: string, value: string | null): string {
  if (value == null || value === "") return "—";
  // "Kinderfreibetrag 2,0" ist ein Zählerwert, kein Geld – obwohl "betrag" drinsteckt.
  if (/freibetrag/i.test(label)) return value;
  if (!GELD_LABEL.test(label)) return value;
  // Reine Zahl, optional mit Dezimaltrenner. Bereits formatierte Werte
  // ("4.200 €") fallen durch und bleiben, wie sie sind.
  const m = value.trim().match(/^-?\d+(?:[.,]\d{1,2})?$/);
  if (!m) return value;
  const zahl = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(zahl)) return value;
  return `${zahl.toLocaleString("de-DE", { maximumFractionDigits: 2 })} €`;
}
