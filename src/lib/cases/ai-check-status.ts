import type { NextStep } from "./next-step";

/**
 * Gemeinsame Sicht von Server-Action und Fallseite darauf, ob eine laufende
 * KI-Prüfung noch als "aktiv" gilt. Stirbt der Hintergrundlauf hart (Deploy,
 * Function-Timeout), bliebe der Fall sonst für immer in `ki_pruefung_laeuft`
 * hängen – ohne Button, ihn je wieder anzustoßen.
 */
export const AI_CHECK_STALE_MS = 10 * 60 * 1000;

export function isAiCheckStale(updatedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - updatedAt.getTime() > AI_CHECK_STALE_MS;
}

/**
 * Läuft eine KI-Prüfung gerade "frisch" – der Fall steht auf
 * `ki_pruefung_laeuft` UND der letzte Update-Zeitstempel ist noch nicht
 * veraltet. Diese Regel entschied bislang an mehreren Stellen unabhängig
 * voneinander (Fallseite, Server-Action `runAiCheck`) darüber, ob ein
 * Hintergrundlauf noch als aktiv gilt – mit dem Risiko, dass sie
 * auseinanderdriften. Eine Kopie hatte genau das Dashboard nie bekommen
 * (siehe withAiCheckStaleOverride unten).
 */
export function isAiCheckRunning(status: string, updatedAt: Date, now: Date = new Date()): boolean {
  return status === "ki_pruefung_laeuft" && !isAiCheckStale(updatedAt, now);
}

/**
 * Ersetzt einen "läuft"-Schritt der Prioritätsleiter (next-step.ts) durch
 * "unterbrochen", wenn der zugrunde liegende KI-Lauf laut isAiCheckRunning
 * nicht mehr aktiv ist. Ohne diesen Schutz bliebe die Leiter für einen hart
 * gestorbenen Hintergrundlauf für immer bei "KI-Auswertung läuft" stehen.
 * Fallseite und Dashboard rufen dieselbe Funktion auf, damit derselbe Fall
 * an beiden Stellen dieselbe Aussage trifft.
 */
export function withAiCheckStaleOverride(step: NextStep, aiCheckRunning: boolean): NextStep {
  if (step.key !== "ki_laeuft" || aiCheckRunning) return step;
  return {
    key: "ki_fehler",
    title: "KI-Prüfung wurde unterbrochen",
    reason: "Der letzte Lauf ist nicht sauber zu Ende gekommen (z. B. durch ein Update). Ein Neustart holt das nach.",
    tone: "review",
  };
}
