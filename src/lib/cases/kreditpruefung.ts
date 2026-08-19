/**
 * Der Stand der Einreichung zur Kreditpruefung – reine Typen und Regeln, ohne
 * Datenbank. Liegt getrennt von der Server-Action, weil ein "use server"-Modul
 * nur asynchrone Funktionen exportieren darf und diese Regel auch die Anzeige
 * (Fallbild, Karte) braucht.
 */

export interface KreditpruefungStand {
  bank: string | null;
  darlehenssumme: number | null;
  sollzinsProzent: number | null;
  zinsbindungJahre: number | null;
  rateMonatlich: number | null;
  tilgungProzent: number | null;
  plattform: string | null;
  quelle: string;
  eingereichtAm: string | null;
  notiz: string | null;
  /** Keine der fuenf Angaben steht – die Phase ist eine leere Behauptung. */
  leer: boolean;
}

/** Welche der fuenf Angaben noch fehlen (fuer die Luecken-Anzeige). */
export function fehlendeAngaben(k: KreditpruefungStand | null): string[] {
  if (!k) {
    return ["Bank", "Darlehenssumme", "Sollzins", "Zinsbindung", "Rate oder Tilgung"];
  }
  const fehlt: string[] = [];
  if (!k.bank) fehlt.push("Bank");
  if (k.darlehenssumme == null) fehlt.push("Darlehenssumme");
  if (k.sollzinsProzent == null) fehlt.push("Sollzins");
  if (k.zinsbindungJahre == null) fehlt.push("Zinsbindung");
  // Rate ODER Tilgung: eines von beiden genuegt, je nachdem was die Bank
  // ausweist. Beides zu verlangen erfaende eine Zahl.
  if (k.rateMonatlich == null && k.tilgungProzent == null) fehlt.push("Rate oder Tilgung");
  return fehlt;
}
