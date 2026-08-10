import { LEAD_PHASES, LEAD_PHASE_LABELS, type LeadPhase } from "@/lib/domain/enums";

/**
 * Gruppiert Fälle in die Spalten des Kanbans. Reine Logik: keine Datenbank,
 * kein React – damit Summen, Sortierung und Deckelung prüfbar bleiben.
 */
export interface BoardKarte {
  caseId: string;
  caseNumber: string;
  kundenName: string;
  /** Darlehensbetrag, sonst Darlehenswunsch, sonst Kaufpreis. */
  volumen: number | null;
  /** Anzeigename der Herkunft, z. B. "ImmoScout24" oder "Unbekannt". */
  quelle: string;
  leadPhase: string;
  leadPhaseSeit: Date;
  wiedervorlage: Date | null;
  verlorenAm: Date | null;
  verlorenGrund: string | null;
  /** Offener Phasenvorschlag oder null. */
  vorschlag: string | null;
  /**
   * Machbarkeits-Ampel. null = bewusst keine Anzeige (verloren/abgeschlossen);
   * das ist etwas anderes als die Farbe "grau", die eine Datenluecke meint.
   */
  ampel: { farbe: string; text: string; grund: string } | null;
}

export interface BoardSpalte {
  phase: string;
  titel: string;
  /** Alle Karten der Spalte – auch die wegen der Deckelung nicht gelieferten. */
  anzahl: number;
  summe: number;
  karten: BoardKarte[];
  /** Wie viele Karten wegen der Deckelung fehlen. */
  weitere: number;
}

/** Volle Tage zwischen zwei Zeitpunkten, nie negativ. */
export function liegezeitTage(seit: Date, jetzt: Date): number {
  return Math.max(0, Math.floor((jetzt.getTime() - seit.getTime()) / 86400_000));
}

export function buildBoard(
  karten: BoardKarte[],
  jetzt: Date,
  maxProSpalte = 50
): { spalten: BoardSpalte[]; verloren: BoardSpalte } {
  void jetzt; // Die Liegezeit rechnet die Ansicht; hier zählt nur die Reihenfolge.
  const offen = karten.filter((k) => !k.verlorenAm);
  const weg = karten.filter((k) => k.verlorenAm);

  // Ältestes oben: Eine Pipeline soll Staus zeigen, nicht Neuzugänge.
  const nachLiegezeit = (a: BoardKarte, b: BoardKarte) =>
    a.leadPhaseSeit.getTime() - b.leadPhaseSeit.getTime();

  const spalte = (phase: string, titel: string, eigene: BoardKarte[]): BoardSpalte => {
    const sortiert = [...eigene].sort(nachLiegezeit);
    return {
      phase,
      titel,
      // Anzahl und Summe zählen ALLE Karten, auch die nicht gelieferten –
      // sonst behauptet der Spaltenkopf weniger, als tatsächlich da liegt.
      anzahl: sortiert.length,
      summe: sortiert.reduce((s, k) => s + (k.volumen ?? 0), 0),
      karten: sortiert.slice(0, maxProSpalte),
      weitere: Math.max(0, sortiert.length - maxProSpalte),
    };
  };

  const spalten = LEAD_PHASES.map((p: LeadPhase) =>
    spalte(
      p,
      LEAD_PHASE_LABELS[p],
      offen.filter((k) => k.leadPhase === p)
    )
  );

  return { spalten, verloren: spalte("verloren", "Verloren", weg) };
}
