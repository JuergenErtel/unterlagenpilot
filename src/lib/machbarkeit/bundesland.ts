import daten from "./plz-bundesland.json";

export const BUNDESLAENDER = [
  "baden_wuerttemberg",
  "bayern",
  "berlin",
  "brandenburg",
  "bremen",
  "hamburg",
  "hessen",
  "mecklenburg_vorpommern",
  "niedersachsen",
  "nordrhein_westfalen",
  "rheinland_pfalz",
  "saarland",
  "sachsen",
  "sachsen_anhalt",
  "schleswig_holstein",
  "thueringen",
] as const;
export type Bundesland = (typeof BUNDESLAENDER)[number];

export const BUNDESLAND_LABELS: Record<Bundesland, string> = {
  baden_wuerttemberg: "Baden-Württemberg",
  bayern: "Bayern",
  berlin: "Berlin",
  brandenburg: "Brandenburg",
  bremen: "Bremen",
  hamburg: "Hamburg",
  hessen: "Hessen",
  mecklenburg_vorpommern: "Mecklenburg-Vorpommern",
  niedersachsen: "Niedersachsen",
  nordrhein_westfalen: "Nordrhein-Westfalen",
  rheinland_pfalz: "Rheinland-Pfalz",
  saarland: "Saarland",
  sachsen: "Sachsen",
  sachsen_anhalt: "Sachsen-Anhalt",
  schleswig_holstein: "Schleswig-Holstein",
  thueringen: "Thüringen",
};

/**
 * Stand der Steuersaetze. Grunderwerbsteuer ist Landesrecht und aendert sich –
 * zuletzt Bremen zum 01.07.2025 von 5,0 auf 5,5 %. Bei jeder Aenderung hier den
 * Stand mitziehen, sonst rechnet der Solver still mit veralteten Werten.
 * Der Stand steht in der Oberflaeche neben dem Satz (machbarkeit-ergebnis.tsx).
 *
 * Vollstaendig nachgeprueft am 14.08.2026: alle 16 Saetze unveraendert
 * bestaetigt, keine Aenderung seit Bremen 01.07.2025, keine fuer 2026
 * beschlossen. Quellen: Wikipedia (Grunderwerbsteuer (Deutschland)) fuer die
 * Gesamtuebersicht, service.bremen.de fuer Bremen (Seitenstand 30.04.2026),
 * steuern.sachsen.de fuer Sachsen.
 *
 * ZWEI FALLEN bei der naechsten Pruefung – beide sind hier aufgetreten:
 *  - **Wikipedias Tabelle hinkt nach.** Sie fuehrte Bremen noch mit 5,0 %,
 *    obwohl die Erhoehung im selben Artikel im Fliesstext steht. Landeswerte
 *    immer gegen die Landesquelle halten, nicht gegen die Uebersicht allein.
 *  - **Rechner- und Ratgeberseiten nennen Sachsen bis heute mit 3,5 %.** Das
 *    ist der Stand VOR dem Haushaltsbegleitgesetz 2023/2024; seit 01.01.2023
 *    sind es 5,5 %. Diese Seiten taugen nicht als Beleg, auch wenn gleich ein
 *    halbes Dutzend dasselbe behauptet.
 */
export const GRESt_STAND = "2026-08-14";

/** Grunderwerbsteuersatz in Prozent. Bei Aenderung auch GRESt_STAND anpassen. */
export const GRUNDERWERBSTEUER: Record<Bundesland, number> = {
  baden_wuerttemberg: 5.0,
  bayern: 3.5,
  berlin: 6.0,
  brandenburg: 6.5,
  bremen: 5.5,
  hamburg: 5.5,
  hessen: 6.0,
  mecklenburg_vorpommern: 6.0,
  niedersachsen: 5.0,
  nordrhein_westfalen: 6.5,
  rheinland_pfalz: 5.0,
  saarland: 6.5,
  sachsen: 5.5,
  sachsen_anhalt: 5.0,
  schleswig_holstein: 6.5,
  thueringen: 5.0,
};

const normOrt = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ");

/**
 * Eine Gemeinde gehoert zu genau einem Bundesland – PLZ UND Ort zusammen sind
 * eindeutig. Die PLZ allein ist es nicht: ein Dutzend PLZ-Gebiete laeuft ueber
 * eine Landesgrenze, weil PLZ an Zustellwegen und nicht an Verwaltungsgrenzen
 * geschnitten sind.
 *
 * `sicher: false` heisst: die PLZ ist mehrdeutig und der Ort half nicht weiter.
 * Dann muss der Vermittler bestaetigen – nie stillschweigend raten, denn 3,5
 * gegen 6,5 % sind bei 400.000 € Kaufpreis 12.000 € Unterschied.
 *
 * Datenquelle: siehe scripts/plz-bundesland-erzeugen.ts
 */
export function bundeslandAusPlzOrt(
  plz: string | null,
  ort: string | null
): { bundesland: Bundesland; sicher: boolean } | null {
  const p = (plz ?? "").trim();
  if (!/^\d{5}$/.test(p)) return null;

  const eindeutig = (daten.eindeutig as Record<string, string>)[p];
  if (eindeutig) return { bundesland: eindeutig as Bundesland, sicher: true };

  const mehrdeutig = (daten.mehrdeutig as Record<string, Record<string, string>>)[p];
  if (!mehrdeutig) return null;

  if (ort) {
    const treffer = mehrdeutig[normOrt(ort)];
    if (treffer) return { bundesland: treffer as Bundesland, sicher: true };
  }

  // Mehrdeutig und kein Ort-Treffer: eine Moeglichkeit als Vorschlag, aber
  // ausdruecklich unsicher – die Oberflaeche fragt dann nach.
  const ersteMoeglichkeit = Object.values(mehrdeutig)[0];
  return ersteMoeglichkeit
    ? { bundesland: ersteMoeglichkeit as Bundesland, sicher: false }
    : null;
}
