import type { Bundesland } from "./bundesland";

/**
 * Alles, was der Solver zum Rechnen braucht – flach und ohne Datenbankbezug,
 * damit jeder Hebel eine Kopie veraendern kann, ohne Nebenwirkungen.
 */
export interface SolverEingabe {
  kaufpreis: number;
  modernisierungskosten: number;
  /**
   * Geschaetzter Wert der Immobilie – der Massstab, an dem die Bank den
   * Auslauf misst. `null` heisst: Es gibt keinen eigenen Wert, der Kaufpreis
   * ist der Massstab.
   *
   * Beim Kauf tragen beide Rollen denselben Betrag, und genau das hat die
   * Rechnung bis zum 16.08.2026 verwechselt: Sie kannte nur den Kaufpreis und
   * blieb deshalb bei Anschlussfinanzierung, Kapitalbeschaffung und
   * Modernisierung immer grau. Getrennt gehalten, weil beim Kauf ein
   * nachverhandelter Preis den Massstab mitsenkt, ein erfasster Objektwert
   * dagegen nicht (siehe Hebel "kaufpreis").
   */
  objektwert: number | null;
  /**
   * Darlehensbedarf, der sich NICHT aus Kaufpreis und Baukosten ergibt: die
   * abzuloesende Restschuld bei einer Anschlussfinanzierung, der benoetigte
   * Betrag bei einer Kapitalbeschaffung. Erhoeht das Darlehen, hebt aber den
   * Beleihungswert nicht.
   */
  weitererDarlehensbedarf: number;
  /**
   * Ist dieser Bedarf ein Wunsch (Kapitalbeschaffung) oder eine Tatsache
   * (Anschlussfinanzierung)?
   *
   * Entscheidet, welchen Rat die Ampel zuerst gibt. Wer Kapital beschaffen
   * will, dem "mehr Eigenkapital" zu empfehlen, ist die eine Antwort, die er
   * sicher nicht brauchen kann – dort zaehlt, wie viel er bekommt. Eine
   * abzuloesende Restschuld dagegen steht fest; dort ist die Eigenmittel-
   * Luecke die richtige Auskunft.
   */
  darlehensbedarfVerhandelbar: boolean;
  /**
   * Auf dem Objekt bleibende Restschuld eines laufenden Darlehens
   * (Kapitalbeschaffung, Modernisierung). Sie verbraucht Beleihungsraum, geht
   * aber nicht ins neue Darlehen – ihre Rate steht bei den laufenden Krediten
   * und darf nicht doppelt zaehlen.
   */
  vorrangigeRestschuld: number;
  /** Aus dem Kaufpreis herausgerechnetes Inventar (nicht beleihbar). */
  inventarAnteil: number;
  /** Am Fall erfasste Nebenkosten. Gesetzt => es wird nicht gerechnet. */
  nebenkostenErfasst: number | null;
  maklerprovisionProzent: number;
  bundesland: Bundesland | null;
  grunderwerbsteuerProzentOverride: number | null;

  eigenkapital: number;
  eigenleistung: number;
  /** Freier Beleihungsraum einer Zusatzsicherheit. */
  zusatzsicherheitBeleihungsraum: number;
  /** Ueber einen Ratenkredit statt das Baudarlehen finanzierter Anteil. */
  ratenkreditAnteil: number;

  tilgungProzent: number;
  /** Konkreter Sollzins aus einem Angebot; null => Annahmen greifen. */
  sollzinsProzent: number | null;
  /**
   * Monatliche Wunschrate des Kunden aus dem Erstgespraech; null => nicht
   * genannt. Sie ist die Grenze des KUNDEN, nicht die der Bank: Sie wird
   * berichtet, geht aber NICHT in `machbar` ein (siehe `bewerte`).
   */
  wunschrateMonatlich: number | null;

  nettoEinkommen: number;
  zusatzEinnahmen: number;
  /** Weitere Erwachsene im Haushalt (Hebel "weiterer Darlehensnehmer"). */
  zusatzErwachsene: number;

  kredite: Array<{ id: string; bezeichnung: string; restschuld: number; rate: number }>;
  /** Summe der Restschulden, die mitfinanziert werden sollen. */
  abzuloesendeRestschuld: number;
  /** Raten der NICHT abgeloesten Kredite. */
  bestehendeRaten: number;

  applicantCount: number;
  anzahlKinder: number;
  wohnflaeche: number;
  hausgeldMonatlich: number | null;
  mieteinnahmenMonatlich: number;

  istNeubauOderModernisierung: boolean;
}

/** Alle Annahmen offengelegt – Muster wie HaushaltAnnahmen. */
export interface Annahmen {
  /** Notar und Grundbuch in Prozent des Kaufpreises. */
  notarGrundbuchProzent: number;
  /** Satz, wenn das Bundesland unbekannt ist: der hoechste, nie ein guenstiger. */
  grEStFallbackProzent: number;
  /** Basiszins fuer das beste Band (<= 60 %), in Prozent p. a. */
  basiszinsProzent: number;
  /**
   * Aufschlag je Band in Prozentpunkten. Vorgaben sind die Mitte dokumentierter
   * Marktspannen (80–90 %: 0,1–0,3; 90–100 %: 0,3–0,8), keine Bankkonditionen.
   */
  aufschlagBis80: number;
  aufschlagBis90: number;
  aufschlagBis100: number;
  aufschlagBis110: number;
  /**
   * Unschaerfe der Aufschlaege in Prozentpunkten. Es gibt keinen "richtigen"
   * Aufschlag – er haengt von Bank, Produkt und Tagesmarkt ab. Der Solver rechnet
   * jedes Ergebnis zusaetzlich mit ± diesem Wert und gibt die Bandbreite aus,
   * statt Praezision vorzutaeuschen.
   */
  aufschlagUnschaerfe: number;
  /** Obergrenze des Auslaufs; darueber gilt der Fall als nicht darstellbar. */
  auslaufObergrenze: number;
  /** Geforderter Haushaltsueberschuss in Euro. */
  ueberschussPuffer: number;
  /** Eigenleistung hoechstens X Prozent der Bau-/Modernisierungskosten. */
  eigenleistungDeckelProzent: number;
  /** Ratenkredit: Zins p. a. und Laufzeit in Monaten. */
  ratenkreditZinsProzent: number;
  ratenkreditLaufzeitMonate: number;
  /** Mindesttilgung, unter die der Solver nicht geht. */
  mindestTilgungProzent: number;
}

export const VORGABE_ANNAHMEN: Annahmen = {
  notarGrundbuchProzent: 2.0,
  grEStFallbackProzent: 6.5,
  basiszinsProzent: 3.5,
  aufschlagBis80: 0.1,
  aufschlagBis90: 0.3,
  aufschlagBis100: 0.6,
  aufschlagBis110: 1.2,
  aufschlagUnschaerfe: 0.25,
  auslaufObergrenze: 110,
  ueberschussPuffer: 0,
  eigenleistungDeckelProzent: 15,
  ratenkreditZinsProzent: 8.0,
  ratenkreditLaufzeitMonate: 84,
  mindestTilgungProzent: 1.0,
};

export interface NebenkostenAufstellung {
  grunderwerbsteuer: number;
  notarGrundbuch: number;
  makler: number;
  summe: number;
  /** false = am Fall erfasster Betrag uebernommen. */
  gerechnet: boolean;
  /** true = Bundesland unbekannt, es gilt der Fallback-Satz. */
  steuersatzUnsicher: boolean;
  grunderwerbsteuerProzent: number;
}
