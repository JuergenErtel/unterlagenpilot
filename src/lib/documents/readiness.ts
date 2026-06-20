import type { ResolvedChecklistItem } from "@/lib/checklists/engine";
import type { Severity } from "@/lib/domain/enums";

/**
 * Einreichungsstatus 0–100 % je Fall.
 *  0–40   viele Daten fehlen
 *  41–70  teilweise vollständig
 *  71–90  fast einreichungsfertig
 *  91–100 prüfbereit / einreichungsfertig
 */
export interface ReadinessInput {
  checklist: ResolvedChecklistItem[];
  plausibility?: Array<{ status: Severity }>;
}

export interface ReadinessResult {
  score: number;
  band: "fehlend" | "teilweise" | "fast" | "fertig";
  label: string;
  mandatoryOpen: number;
  mandatoryTotal: number;
}

const WEIGHT = { zwingend: 3, bankabhaengig: 2, spaeter: 1, optional: 0.5 } as const;

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  let earned = 0;
  let possible = 0;
  let mandatoryOpen = 0;
  let mandatoryTotal = 0;

  for (const item of input.checklist) {
    const w = WEIGHT[item.level];
    possible += w;
    if (item.level === "zwingend") {
      mandatoryTotal++;
      if (item.status !== "vorhanden" && item.status !== "nicht_erforderlich") mandatoryOpen++;
    }
    if (item.status === "vorhanden" || item.status === "nicht_erforderlich") earned += w;
    else if (item.status === "unvollstaendig" || item.status === "nicht_aktuell") earned += w * 0.4;
  }

  let score = possible === 0 ? 0 : Math.round((earned / possible) * 100);

  // Kritische Plausibilitätsbefunde deckeln den Score (Vorsicht statt Optimismus).
  const critical = (input.plausibility ?? []).filter((c) => c.status === "kritisch").length;
  if (critical > 0) score = Math.min(score, 70);
  if (mandatoryOpen > 0) score = Math.min(score, 90);

  return { score, ...band(score), mandatoryOpen, mandatoryTotal };
}

function band(score: number): { band: ReadinessResult["band"]; label: string } {
  if (score <= 40) return { band: "fehlend", label: "Viele Daten fehlen" };
  if (score <= 70) return { band: "teilweise", label: "Teilweise vollständig" };
  if (score <= 90) return { band: "fast", label: "Fast einreichungsfertig" };
  return { band: "fertig", label: "Prüfbereit / einreichungsfertig" };
}
