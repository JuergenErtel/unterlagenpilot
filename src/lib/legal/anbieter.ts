/**
 * Die Anbieterangaben des Betreibers – EINE Quelle fuer Impressum, AGB und
 * Datenschutzerklaerung.
 *
 * Warum eigens ein Modul: Anschrift und Kontaktadresse standen an drei Stellen
 * ausgeschrieben, und genau daraus ist eine Abweichung entstanden. AGB und
 * Datenschutzerklaerung nannten den Ort verkuerzt als "76744 Woerth", waehrend
 * im Handelsregister "Woerth am Rhein" steht. Wer die Anschrift kuenftig
 * aendert, aendert sie hier – und damit ueberall.
 *
 * Die Angaben sind am 18.08.2026 aus dem Impressum von codingbrothers.de
 * uebernommen: derselbe Betreiber, dieselbe Gesellschaft.
 *
 * `null` heisst "liegt nicht vor" und wird von der Impressumsseite
 * weggelassen, nicht als Platzhalter gezeigt: Eine unvollstaendige Angabe ist
 * ein Mangel, eine erfundene waere eine falsche Angabe.
 */
export const ANBIETER = {
  firma: "Coding Brothers UG (haftungsbeschränkt)",
  strasse: "Ottstr. 9",
  ort: "76744 Wörth am Rhein",
  land: "Deutschland",
  email: "info@codingbrothers.de",
  telefon: "07271 / 5007547" as string | null,
  register: "Amtsgericht Landau, HRB 34581" as string | null,
  /** Beide Geschäftsführer, wie im Register eingetragen. */
  vertreten: "Carsten Hater und Jürgen Ertel" as string | null,
  /** Umsatzsteuer-Identifikationsnummer nach § 27a UStG. */
  ustId: "DE 463262784" as string | null,
} as const;

/**
 * Firma und Anschrift in einer Zeile – die Form, in der AGB und
 * Datenschutzerklaerung den Anbieter nennen. Die vollstaendigen Angaben
 * (Geschaeftsfuehrung, Register, USt-IdNr.) stehen im Impressum; sie in jedem
 * Rechtstext zu wiederholen hiesse, die Abweichung von morgen anzulegen.
 */
export const ANBIETER_ZEILE = `${ANBIETER.firma}, ${ANBIETER.strasse}, ${ANBIETER.ort}`;
