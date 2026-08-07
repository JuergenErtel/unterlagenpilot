import { LEAD_PHASES, type LeadPhase } from "@/lib/domain/enums";

/**
 * Vorschlag für die nächste Vertriebsphase – reine Logik, keine Datenbank.
 *
 * Grundsätze:
 *  - Nur vorwärts. Ein zurückgestufter Fall wäre eine stille Korrektur der
 *    Einschätzung des Vermittlers.
 *  - Nichts bei verlorenen Fällen.
 *  - Kein Vorschlag für `finanzierungsvorschlag` und `zusage`: Beides passiert
 *    außerhalb (Vorschlag in Europace, Zusage per Mail der Bank). Ein oft
 *    falscher Vorschlag ist schlimmer als keiner – man gewöhnt sich das
 *    Wegklicken an und übersieht dann die richtigen.
 */
export interface PhasenSignale {
  /** Aktuelle Phase des Falls. */
  leadPhase: string;
  verlorenAm: Date | null;
  status: string;
  abschlussdatum: Date | null;
  /** Ein Upload- oder Selbstauskunftslink wurde erzeugt. */
  hatLink: boolean;
  /** Eine GeneratedMessage mit sent = true liegt vor. */
  hatGesendeteNachricht: boolean;
  /** Der Kunde hat den Selbstauskunftsbogen begonnen. */
  selbstauskunftBegonnen: boolean;
  dokumenteVorhanden: boolean;
}

/** Position in der Phasenkette; -1 für unbekannte Werte. */
export function phasenIndex(p: string): number {
  return (LEAD_PHASES as readonly string[]).indexOf(p);
}

export function schlagePhaseVor(s: PhasenSignale): LeadPhase | null {
  if (s.verlorenAm) return null;

  // Von hinten nach vorn: die am weitesten fortgeschrittene erkennbare Phase.
  let erkannt: LeadPhase | null = null;
  if (s.status === "abgeschlossen" || s.abschlussdatum) {
    erkannt = "abgeschlossen";
  } else if (s.status === "exportiert" || s.status === "uebertragen") {
    erkannt = "kreditpruefung_eingereicht";
  } else if (s.selbstauskunftBegonnen || s.dokumenteVorhanden) {
    erkannt = "selbstauskunft_laeuft";
  } else if (s.hatLink || s.hatGesendeteNachricht) {
    erkannt = "anfrage_erstellt";
  }

  if (!erkannt) return null;
  return phasenIndex(erkannt) > phasenIndex(s.leadPhase) ? erkannt : null;
}
