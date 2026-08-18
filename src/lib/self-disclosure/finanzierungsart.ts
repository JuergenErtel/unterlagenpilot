/**
 * Die sechs Auswahlmoeglichkeiten des Selbstauskunft-Bogens auf die Werte von
 * `FinancingType` abbilden.
 *
 * Eigene Datei, weil zwei Stellen dieselbe Uebersetzung brauchen und sie
 * frueher nur an einer stand:
 *
 *  - `schreiben.ts` beim **Uebernehmen** (Katalogwert -> Spaltenwert),
 *  - `takeover.ts` beim **Vergleichen**.
 *
 * Ohne sie beim Vergleich verglich der Uebernahmeplan den rohen Enum-Wert des
 * Falls ("kauf") mit dem Katalogwert des Kunden ("kauf_bestand"). Ergebnis war
 * eine Schein-Abweichung, die der Vermittler dauerhaft angezeigt bekam und die
 * beim Uebernehmen exakt nichts geaendert haette.
 *
 * Das Schema kennt keinen eigenen Wert fuer "eigenes Bauvorhaben" – er landet
 * wie "Kauf Neubau" auf "neubau". "umschuldung" hat keine Entsprechung im
 * Katalog.
 */
export const KATALOG_ZU_FINANZIERUNGSART: Record<string, string> = {
  kauf_neubau: "neubau",
  kauf_bestand: "kauf",
  eigenes_bauvorhaben: "neubau",
  modernisierung: "modernisierung",
  anschlussfinanzierung: "anschlussfinanzierung",
  kapitalbeschaffung: "kapitalbeschaffung",
};
