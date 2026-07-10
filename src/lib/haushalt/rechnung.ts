import type { CanonicalCase } from "@/lib/domain/canonical";

/**
 * Haushaltsrechnung / Kapitaldienstfähigkeit – das Kernprüfinstrument der
 * Backoffice-Sachbearbeitung. Rein (ohne I/O), damit testbar.
 *
 * Ergebnis ist eine nachvollziehbare Aufstellung: monatliche Einnahmen minus
 * Lebenshaltung, bestehende Raten, Objektbewirtschaftung und die (geschätzte)
 * neue Darlehensrate → verfügbarer Überschuss. Alle Pauschalen/Annahmen sind
 * offengelegt und überschreibbar, weil Banken sie unterschiedlich ansetzen.
 */

export interface HaushaltAnnahmen {
  /** Lebenshaltungspauschale erster Erwachsener (€/Monat). */
  lebenshaltungErsteErwachsene: number;
  /** Aufschlag je weiterem Erwachsenen (€/Monat). */
  lebenshaltungWeitereErwachsene: number;
  /** Aufschlag je Kind (€/Monat). */
  lebenshaltungProKind: number;
  /** Bewirtschaftungskosten Selbstnutzung, falls kein Hausgeld erfasst (€/m²/Monat). */
  bewirtschaftungProQm: number;
  /**
   * Stress-Annuität (Sollzins + Tilgung, % p. a.) für die geschätzte Rate, solange
   * kein konkreter Sollzins vorliegt. 6 % ist ein gängiger, konservativer Ansatz
   * (z. B. 4 % Sollzins + 2 % Anfangstilgung).
   */
  stressAnnuitaetProzent: number;
  /** Tilgungsanteil, wenn ein konkreter Sollzins gesetzt ist (% p. a.). */
  tilgungProzent: number;
}

export const DEFAULT_ANNAHMEN: HaushaltAnnahmen = {
  lebenshaltungErsteErwachsene: 700,
  lebenshaltungWeitereErwachsene: 300,
  lebenshaltungProKind: 250,
  bewirtschaftungProQm: 3,
  stressAnnuitaetProzent: 6,
  tilgungProzent: 2,
};

export interface HaushaltPosition {
  label: string;
  /** Monatlicher Betrag in €. Einnahmen positiv, Ausgaben negativ. */
  betrag: number;
  hinweis?: string;
}

export interface HaushaltErgebnis {
  einnahmen: HaushaltPosition[];
  ausgaben: HaushaltPosition[];
  summeEinnahmen: number;
  summeAusgaben: number;
  /** Rate des neuen Darlehens (geschätzt oder aus Sollzins berechnet). */
  geplanteRate: number;
  rateGeschaetzt: boolean;
  /** Einnahmen − Ausgaben − geplante Rate. */
  ueberschuss: number;
  /** Anteil der Wohnkosten (geplante Rate + Bewirtschaftung) an den Einnahmen. */
  wohnkostenquote: number;
  tragfaehig: boolean;
  annahmen: HaushaltAnnahmen;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function berechneHaushalt(
  caseData: Pick<CanonicalCase, "income" | "liabilities" | "property" | "financing"> & {
    applicantCount?: number;
    anzahlKinder?: number;
  },
  override: Partial<HaushaltAnnahmen> = {}
): HaushaltErgebnis {
  const a = { ...DEFAULT_ANNAHMEN, ...override };
  const erwachsene = Math.max(caseData.applicantCount ?? 1, 1);
  const kinder = Math.max(caseData.anzahlKinder ?? 0, 0);

  // ---- Einnahmen ----
  const netto = sum((caseData.income ?? []).map((i) => i.nettoMonatlich ?? 0));
  const sonstige = sum((caseData.income ?? []).map((i) => i.sonstigeEinnahmen ?? 0));
  const mieteIncome = sum((caseData.income ?? []).map((i) => i.mieteinnahmen ?? 0));
  const mieteObjekt = caseData.property?.mieteinnahmenMonatlich ?? 0;

  const einnahmen: HaushaltPosition[] = [
    { label: "Nettoeinkommen (alle Antragsteller)", betrag: round2(netto) },
  ];
  if (sonstige > 0) einnahmen.push({ label: "Sonstige regelmäßige Einnahmen", betrag: round2(sonstige) });
  const mieteGesamt = mieteIncome + mieteObjekt;
  if (mieteGesamt > 0) {
    einnahmen.push({
      label: "Mieteinnahmen",
      betrag: round2(mieteGesamt),
      hinweis: "Banküblich oft nur zu ~75 % angerechnet – hier voll ausgewiesen.",
    });
  }

  // ---- Ausgaben ----
  const lebenshaltung =
    a.lebenshaltungErsteErwachsene +
    a.lebenshaltungWeitereErwachsene * (erwachsene - 1) +
    a.lebenshaltungProKind * kinder;

  const bestehendeRaten = sum(
    (caseData.liabilities ?? [])
      .filter((l) => !l.abzuloesen) // abzulösende Kredite werden mitfinanziert → fallen weg
      .map((l) => l.monatlicheRate ?? 0)
  );

  const hausgeld = caseData.property?.hausgeldMonatlich ?? 0;
  const wohnflaeche = caseData.property?.wohnflaeche ?? 0;
  const bewirtschaftung = hausgeld > 0 ? hausgeld : round2(wohnflaeche * a.bewirtschaftungProQm);

  const ausgaben: HaushaltPosition[] = [
    {
      label: `Lebenshaltung (${erwachsene} Erw.${kinder > 0 ? `, ${kinder} Kind(er)` : ""})`,
      betrag: -round2(lebenshaltung),
      hinweis: "Pauschale – je nach Bank abweichend.",
    },
  ];
  if (bestehendeRaten > 0) {
    ausgaben.push({ label: "Bestehende Kreditraten (nicht abzulösen)", betrag: -round2(bestehendeRaten) });
  }
  if (bewirtschaftung > 0) {
    ausgaben.push({
      label: "Objektbewirtschaftung",
      betrag: -round2(bewirtschaftung),
      hinweis: hausgeld > 0 ? "Hausgeld laut Angabe." : `Geschätzt (${a.bewirtschaftungProQm} €/m²).`,
    });
  }

  // ---- Geplante Darlehensrate ----
  const darlehen = caseData.financing?.darlehensbetrag ?? caseData.financing?.darlehenswunsch ?? 0;
  const sollzins = caseData.financing?.sollzinsProzent;
  const rateGeschaetzt = sollzins == null;
  const annuitaet = sollzins != null ? sollzins + a.tilgungProzent : a.stressAnnuitaetProzent;
  const geplanteRate = round2((darlehen * (annuitaet / 100)) / 12);

  const summeEinnahmen = round2(sum(einnahmen.map((p) => p.betrag)));
  const summeAusgaben = round2(sum(ausgaben.map((p) => p.betrag))); // negativ
  const ueberschuss = round2(summeEinnahmen + summeAusgaben - geplanteRate);
  const wohnkostenquote =
    summeEinnahmen > 0 ? round2(((geplanteRate + bewirtschaftung) / summeEinnahmen) * 100) : 0;

  return {
    einnahmen,
    ausgaben,
    summeEinnahmen,
    summeAusgaben,
    geplanteRate,
    rateGeschaetzt,
    ueberschuss,
    wohnkostenquote,
    tragfaehig: ueberschuss >= 0,
    annahmen: a,
  };
}
