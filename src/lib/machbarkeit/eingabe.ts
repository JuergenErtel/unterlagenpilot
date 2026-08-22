import type { CanonicalCase } from "@/lib/domain/canonical";
import type { FinancingType } from "@/lib/domain/enums";
import { bundeslandAusPlzOrt, type Bundesland } from "./bundesland";
import type { SolverEingabe } from "./types";

export type EingabeErgebnis =
  | { ok: true; eingabe: SolverEingabe; bundeslandUnsicher: boolean }
  | { ok: false; fehlend: string[] };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Vorhabensarten, bei denen der Kunde die Immobilie bereits besitzt und der
 * Darlehensbetrag deshalb direkt gefragt wird, statt sich aus einem Kaufpreis
 * zu ergeben. Der Bogen fuellt beide in `financing.darlehenswunsch` – unter
 * ihrem eigenen Namen ("Restschuld" bzw. "Benoetigter Betrag").
 */
const BEDARF_STATT_KAUFPREIS: Partial<Record<FinancingType, string>> = {
  anschlussfinanzierung: "Abzulösende Restschuld",
  umschuldung: "Abzulösende Restschuld",
  kapitalbeschaffung: "Benötigter Darlehensbetrag",
};

/**
 * Vorhabensarten, bei denen dem Kunden die Immobilie bereits GEHOERT.
 *
 * Ein Kaufpreis am Fall ist dort keine Finanzierungsposition, sondern ein
 * Rest: entweder der historische Preis oder – haeufiger – ein stehen
 * gebliebener Wert aus einer frueheren Vorhabensart. Ihn mitzufinanzieren
 * verdoppelt das Darlehen und erfindet obendrein Grunderwerbsteuer
 * (`berechneNebenkosten` rechnet auf dem Kaufpreis).
 *
 * Genau das ist am 22.08.2026 passiert: Fall UP-2026-0015 wurde von "Kauf"
 * auf "Kapitalbeschaffung" umgestellt, der Kaufpreis von 310.000 € blieb
 * stehen – und die Fallakte rechnete 310.000 + 270.000 + 26.350 Nebenkosten
 * = 151 % Auslauf statt der richtigen 70 %.
 *
 * Massstab darf der Kaufpreis weiterhin sein, wenn kein Objektwert erfasst
 * ist – aber nur das. Siehe den Dateikopf zur Trennung der beiden Rollen.
 */
const BESITZT_IMMOBILIE_BEREITS: ReadonlySet<FinancingType> = new Set<FinancingType>([
  "anschlussfinanzierung",
  "umschuldung",
  "kapitalbeschaffung",
  "modernisierung",
]);

/**
 * CanonicalCase → SolverEingabe.
 *
 * Ohne Grundbetrag, Objektwert oder Nettoeinkommen wird NICHT gerechnet,
 * sondern die Luecke benannt. Mit stillen Nullen weiterzurechnen hat in diesem
 * Projekt schon einmal eine Einkommensanalyse unbemerkt kaputtgemacht – und
 * hier haengt an dem Ergebnis eine Absage oder Zusage gegenueber dem Kunden.
 *
 * Welcher Betrag der Grundbetrag ist, haengt an der Vorhabensart (Juergen,
 * 16.08.2026): beim Kauf der Kaufpreis, bei der Modernisierung die
 * Modernisierungskosten, bei Anschlussfinanzierung und Kapitalbeschaffung die
 * jeweilige Darlehenssumme. Der Objektwert ist davon UNABHAENGIG – er ist der
 * Massstab der Bank, nicht das, was finanziert wird.
 */
export function baueEingabe(
  c: CanonicalCase,
  opts: {
    applicantCount: number;
    anzahlKinder: number;
    grunderwerbsteuerProzentOverride?: number | null;
    bundeslandOverride?: Bundesland | null;
  }
): EingabeErgebnis {
  const fehlend: string[] = [];

  const erfassterKaufpreis = c.financing?.kaufpreis ?? c.financing?.baukosten ?? 0;
  const bestandsobjekt = c.financingType
    ? BESITZT_IMMOBILIE_BEREITS.has(c.financingType)
    : false;
  // Was finanziert wird. Bei den Bestandsarten NICHT der Kaufpreis (s. o.).
  const kaufpreis = bestandsobjekt ? 0 : erfassterKaufpreis;
  const modernisierungskosten = c.financing?.modernisierungskosten ?? 0;

  const bedarfsName = c.financingType ? BEDARF_STATT_KAUFPREIS[c.financingType] : undefined;
  const weitererDarlehensbedarf = bedarfsName ? (c.financing?.darlehenswunsch ?? 0) : 0;

  // Der Darlehenswunsch zaehlt NUR bei diesen Arten. Beim Kauf ist er die
  // Schaetzung des Kunden fuer genau die Summe, die die Rechnung selbst aus
  // Kaufpreis, Nebenkosten und Eigenkapital ermittelt – ihn zu addieren wuerde
  // das Darlehen verdoppeln.
  const grundbetrag = kaufpreis + modernisierungskosten + weitererDarlehensbedarf;
  if (!grundbetrag) {
    fehlend.push(
      bedarfsName ??
        (c.financingType === "modernisierung" ? "Modernisierungskosten" : "Kaufpreis oder Baukosten")
    );
  }

  // Ohne erfassten Objektwert ist der Kaufpreis der Massstab. Fehlt beides,
  // laesst sich kein Auslauf bilden – und ein Urteil ohne Auslauf waere
  // allein die Haushaltssicht und damit zu optimistisch.
  //
  // Bei den Bestandsarten muss der Kaufpreis hier ausdruecklich eingesetzt
  // werden: `bewerte` faellt sonst auf `e.kaufpreis` zurueck, und der ist dort
  // bewusst 0 – der Beleihungswert waere null und der Auslauf unendlich.
  const objektwert =
    c.property?.objektwert ?? (bestandsobjekt ? erfassterKaufpreis || null : null);
  if (!objektwert && !kaufpreis) fehlend.push("Wert der Immobilie");

  const nettoEinkommen = sum((c.income ?? []).map((i) => i.nettoMonatlich ?? 0));
  if (!nettoEinkommen) fehlend.push("Nettoeinkommen mindestens eines Antragstellers");

  if (fehlend.length > 0) return { ok: false, fehlend };

  const erkannt = opts.bundeslandOverride
    ? { bundesland: opts.bundeslandOverride, sicher: true }
    : bundeslandAusPlzOrt(c.property?.plz ?? null, c.property?.ort ?? null);

  // Kredite mit laufender Rate sind Hebelkandidaten. Bereits als abzuloesen
  // markierte zaehlen zur Restschuld und stehen nicht mehr zur Wahl.
  const kredite = (c.liabilities ?? [])
    .filter((l) => !l.abzuloesen && (l.monatlicheRate ?? 0) > 0)
    .map((l, i) => ({
      id: `l${i}`,
      bezeichnung: l.art || "Kredit",
      restschuld: l.restschuld ?? 0,
      rate: l.monatlicheRate ?? 0,
    }));

  return {
    ok: true,
    bundeslandUnsicher: erkannt ? !erkannt.sicher : true,
    eingabe: {
      kaufpreis,
      modernisierungskosten,
      objektwert,
      weitererDarlehensbedarf,
      darlehensbedarfVerhandelbar: c.financingType === "kapitalbeschaffung",
      vorrangigeRestschuld: c.property?.bestehendeGrundschuld ?? 0,
      inventarAnteil: 0,
      nebenkostenErfasst: c.financing?.nebenkosten ?? null,
      maklerprovisionProzent: c.financing?.maklerprovisionProzent ?? 0,
      bundesland: erkannt?.bundesland ?? null,
      grunderwerbsteuerProzentOverride: opts.grunderwerbsteuerProzentOverride ?? null,
      eigenkapital: c.financing?.eigenkapital ?? 0,
      eigenleistung: 0,
      zusatzsicherheitBeleihungsraum: 0,
      ratenkreditAnteil: 0,
      tilgungProzent: 2,
      sollzinsProzent: c.financing?.sollzinsProzent ?? null,
      wunschrateMonatlich: c.financing?.wunschrateMonatlich ?? null,
      nettoEinkommen,
      zusatzEinnahmen: sum((c.income ?? []).map((i) => i.sonstigeEinnahmen ?? 0)),
      zusatzErwachsene: 0,
      kredite,
      abzuloesendeRestschuld: sum(
        (c.liabilities ?? []).filter((l) => l.abzuloesen).map((l) => l.restschuld ?? 0)
      ),
      bestehendeRaten: sum(kredite.map((k) => k.rate)),
      applicantCount: opts.applicantCount,
      anzahlKinder: opts.anzahlKinder,
      wohnflaeche: c.property?.wohnflaeche ?? 0,
      hausgeldMonatlich: c.property?.hausgeldMonatlich ?? null,
      mieteinnahmenMonatlich: c.property?.mieteinnahmenMonatlich ?? 0,
      istNeubauOderModernisierung:
        c.financingType === "neubau" || c.financingType === "modernisierung",
    },
  };
}
