import { berechneNebenkosten } from "@/lib/machbarkeit/nebenkosten";
import { bundeslandAusPlzOrt } from "@/lib/machbarkeit/bundesland";
import { VORGABE_ANNAHMEN, type SolverEingabe, type NebenkostenAufstellung } from "@/lib/machbarkeit/types";

/**
 * Nebenkosten im Erstgespraech sofort zeigen, statt sie zu erfragen.
 *
 * Duenne Huelle um die Rechnung des Machbarkeits-Solvers (berechneNebenkosten)
 * – bewusst dieselbe Funktion, damit Gespraech und spaetere Machbarkeits-
 * rechnung nie verschiedene Zahlen nennen. Nebenkosten sind nicht beleihbar;
 * wer sie frueh sieht, erkennt sofort, ob das Eigenkapital traegt.
 */
export interface VorschauEingabe {
  kaufpreis: number | null;
  plz: string | null;
  /**
   * Ort des Objekts. Optional, hilft aber bei PLZ-Gebieten, die ueber eine
   * Landesgrenze laufen (siehe bundeslandAusPlzOrt) – ohne Ort bleibt der
   * Grunderwerbsteuersatz dort unsicher.
   */
  ort?: string | null;
  maklerprovisionProzent: number | null;
  /** Am Fall erfasster Betrag; gewinnt gegen die Rechnung. */
  nebenkostenErfasst?: number | null;
  grunderwerbsteuerProzentOverride?: number | null;
}

export function nebenkostenVorschau(eingabe: VorschauEingabe): NebenkostenAufstellung | null {
  if (eingabe.kaufpreis == null || eingabe.kaufpreis <= 0) return null;

  const treffer = bundeslandAusPlzOrt(eingabe.plz ?? null, eingabe.ort ?? null);
  // Eine mehrdeutige PLZ-Zuordnung (Landesgrenze, kein Ort-Treffer) zaehlt als
  // unbekanntes Bundesland. bundeslandAusPlzOrt() ist hier ausdruecklich: "nie
  // stillschweigend raten" – wuerden wir den unsicheren Vorschlag trotzdem
  // durchreichen, wuerde berechneNebenkosten() ihn faelschlich als sicher
  // ausweisen (steuersatzUnsicher = false).
  const bundesland = treffer?.sicher ? treffer.bundesland : null;

  // berechneNebenkosten() liest nur kaufpreis, inventarAnteil,
  // nebenkostenErfasst, maklerprovisionProzent, bundesland und
  // grunderwerbsteuerProzentOverride (siehe src/lib/machbarkeit/nebenkosten.ts).
  // Alle uebrigen SolverEingabe-Felder gehen in die Rechnung nicht ein, sind
  // aber Teil des gemeinsamen Typs (SolverEingabe traegt auch die Hebel der
  // vollen Machbarkeitsrechnung). Sie bekommen neutrale Werte – 0 bzw. null
  // bzw. leere Liste –, weil das Erstgespraech an dieser Stelle noch keinen
  // Machbarkeits-Solver-Lauf macht, sondern nur die Nebenkosten vorrechnet.
  const solverEingabe: SolverEingabe = {
    kaufpreis: eingabe.kaufpreis,
    modernisierungskosten: 0,
    inventarAnteil: 0,
    nebenkostenErfasst: eingabe.nebenkostenErfasst ?? null,
    maklerprovisionProzent: eingabe.maklerprovisionProzent ?? 0,
    bundesland,
    grunderwerbsteuerProzentOverride: eingabe.grunderwerbsteuerProzentOverride ?? null,
    eigenkapital: 0,
    eigenleistung: 0,
    zusatzsicherheitBeleihungsraum: 0,
    ratenkreditAnteil: 0,
    tilgungProzent: 0,
    sollzinsProzent: null,
    nettoEinkommen: 0,
    zusatzEinnahmen: 0,
    zusatzErwachsene: 0,
    kredite: [],
    abzuloesendeRestschuld: 0,
    bestehendeRaten: 0,
    applicantCount: 0,
    anzahlKinder: 0,
    wohnflaeche: 0,
    hausgeldMonatlich: null,
    mieteinnahmenMonatlich: 0,
    istNeubauOderModernisierung: false,
  };

  // VORGABE_ANNAHMEN statt ladeAnnahmen(organizationId): ladeAnnahmen laedt
  // organisationsspezifische Zinswerte aus der Datenbank – fuer die
  // Nebenkosten-Vorschau (kein Zinsbezug, reine Kaufnebenkosten) unnoetiger
  // DB-Roundtrip. Betroffen waeren ohnehin nur Zinsfelder, die
  // berechneNebenkosten() gar nicht liest.
  return berechneNebenkosten(solverEingabe, VORGABE_ANNAHMEN);
}
