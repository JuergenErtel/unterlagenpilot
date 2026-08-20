/**
 * Provisions-/Abschluss-Auswertung. Rein (ohne I/O), damit testbar.
 * Courtage = Darlehensbetrag × Courtagesatz. Fehlen Werte, ist die Courtage null.
 */

export interface PipelineCaseInput {
  caseId: string;
  caseNumber: string;
  kundenName: string;
  status: string;
  /**
   * Vertriebsphase. Wenn gesetzt, entscheidet SIE über "abgeschlossen" –
   * nicht der CaseStatus: Der misst die Unterlagen, und ein Fall mit fertigen
   * Unterlagen (Status "abgeschlossen") kann vertrieblich noch in der Zusage
   * stehen. Optional, damit Aufrufer ohne Phase (und die Bestandstests) beim
   * bisherigen Status-Kriterium bleiben.
   */
  leadPhase?: string | null;
  /** Verlorene Fälle zählen weder als offen noch als erwartete Courtage. */
  verloren?: boolean;
  abschlussBank: string | null;
  darlehensbetrag: number | null;
  courtageProzent: number | null;
  abschlussdatum: Date | null;
}

export interface PipelineCase extends PipelineCaseInput {
  /** Erwartete/erzielte Courtage in €, null wenn nicht berechenbar. */
  courtage: number | null;
}

export interface PipelineSummary {
  offen: PipelineCase[];
  abgeschlossen: PipelineCase[];
  /** Summe der Courtage abgeschlossener Fälle. */
  courtageAbgeschlossen: number;
  /** Summe der (erwarteten) Courtage noch offener, aber schon bepreister Fälle. */
  couragePipeline: number;
}

export function courtageOf(darlehensbetrag: number | null, courtageProzent: number | null): number | null {
  if (darlehensbetrag == null || courtageProzent == null) return null;
  return Math.round((darlehensbetrag * courtageProzent) / 100);
}

export function buildPipeline(cases: PipelineCaseInput[]): PipelineSummary {
  const enriched: PipelineCase[] = cases.map((c) => ({
    ...c,
    courtage: courtageOf(c.darlehensbetrag, c.courtageProzent),
  }));

  const istAbgeschlossen = (c: PipelineCase) =>
    c.leadPhase != null ? c.leadPhase === "abgeschlossen" : c.status === "abgeschlossen";

  const abgeschlossen = enriched.filter((c) => !c.verloren && istAbgeschlossen(c));
  const offen = enriched.filter((c) => !c.verloren && !istAbgeschlossen(c));

  const sum = (xs: PipelineCase[]) => xs.reduce((acc, c) => acc + (c.courtage ?? 0), 0);

  return {
    offen,
    abgeschlossen,
    courtageAbgeschlossen: sum(abgeschlossen),
    couragePipeline: sum(offen),
  };
}
