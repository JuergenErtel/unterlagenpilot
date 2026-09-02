import type { ErgebnisArt } from "@/lib/backoffice/leistungen";
import type { RequirementLevel } from "@/lib/domain/enums";

/**
 * Kleine, reine Uebersetzungen fuer das Auftraggeberportal. Der Auftraggeber
 * liest Alltagssprache: „in Prüfung" statt „reviewStatus offen".
 */

export const PORTAL_REVIEW_LABELS: Record<string, string> = {
  offen: "In Prüfung",
  akzeptiert: "Geprüft",
  abgelehnt: "Abgelehnt",
  ersetzt: "Ersetzt",
  duplikat: "Doppelt eingereicht",
};

export function reviewLabel(status: string): string {
  return PORTAL_REVIEW_LABELS[status] ?? status;
}

export const PORTAL_LEVEL_LABELS: Record<RequirementLevel, string> = {
  zwingend: "zwingend",
  spaeter: "später erforderlich",
  optional: "optional",
  bankabhaengig: "bankabhängig",
};

/** Welche Ergebnisart ueber die Ergebnis-Route abrufbar ist - und unter welchem type. */
export const ERGEBNIS_ROUTE_TYPE: Partial<Record<ErgebnisArt, "checklist" | "zip" | "bank-summary" | "wohnflaeche">> = {
  checkliste: "checklist",
  dokumente: "zip",
  bank_zusammenfassung: "bank-summary",
  wohnflaeche: "wohnflaeche",
};

export function fehltText(n: number): string {
  if (n <= 0) return "—";
  return n === 1 ? "1 Unterlage fehlt" : `${n} Unterlagen fehlen`;
}

export function mehrzahl(n: number, einzahl: string, mehrzahl: string): string {
  return `${n} ${n === 1 ? einzahl : mehrzahl}`;
}
