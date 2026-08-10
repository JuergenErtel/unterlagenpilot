import type { CanonicalCase } from "@/lib/domain/canonical";
import { bundeslandAusPlzOrt, type Bundesland } from "./bundesland";
import type { SolverEingabe } from "./types";

export type EingabeErgebnis =
  | { ok: true; eingabe: SolverEingabe; bundeslandUnsicher: boolean }
  | { ok: false; fehlend: string[] };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * CanonicalCase → SolverEingabe.
 *
 * Ohne Kaufpreis oder Nettoeinkommen wird NICHT gerechnet, sondern die Luecke
 * benannt. Mit stillen Nullen weiterzurechnen hat in diesem Projekt schon
 * einmal eine Einkommensanalyse unbemerkt kaputtgemacht – und hier haenge an
 * dem Ergebnis eine Absage oder Zusage gegenueber dem Kunden.
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

  const kaufpreis = c.financing?.kaufpreis ?? c.financing?.baukosten ?? 0;
  if (!kaufpreis) fehlend.push("Kaufpreis oder Baukosten");

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
      modernisierungskosten: c.financing?.modernisierungskosten ?? 0,
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
