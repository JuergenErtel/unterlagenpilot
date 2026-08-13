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
 * Läuft für den Fall ÜBERHAUPT eine KI-Verarbeitung – egal, wer sie ausgelöst
 * hat? Genau diese Frage stellt die Prioritätsleiter, wenn sie `ki_laeuft`
 * liefert (next-step.ts: `status === "ki_pruefung_laeuft" || docsLaufend > 0`).
 *
 * Es gibt nämlich ZWEI Auslöser, und `isAiCheckRunning` kennt nur den
 * selteneren:
 *  - Der manuelle Sammel-Lauf (`runAiCheck`) setzt `case.status` auf
 *    `ki_pruefung_laeuft`. Sein Alter steht in `case.updatedAt`.
 *  - Der weitaus häufigere normale Upload (`runPipelineAfterStore`) setzt je
 *    Dokument `classificationStatus: "laeuft"` und fasst den Fallstatus NIE an.
 *    Sein Alter steht am DOKUMENT (`document.updatedAt`) – deshalb erwartet
 *    diese Funktion `docsLaufend` bereits altersbereinigt
 *    (`countRunningClassifications`, documents/processing.ts).
 *
 * Ohne den zweiten Auslöser behauptete `withAiCheckStaleOverride` bei jedem
 * frischen Einzel-Upload "KI-Prüfung wurde unterbrochen": Der Fall stand ja
 * weiter auf z. B. `unterlagen_fehlen`, also war `isAiCheckRunning` falsch,
 * während der Lauf ganz normal arbeitete.
 */
export function isAnyAiCheckRunning(
  status: string,
  updatedAt: Date,
  docsLaufend: number,
  now: Date = new Date()
): boolean {
  return docsLaufend > 0 || isAiCheckRunning(status, updatedAt, now);
}

/**
 * Ersetzt einen "läuft"-Schritt der Prioritätsleiter (next-step.ts) durch
 * "unterbrochen", wenn der zugrunde liegende KI-Lauf nicht mehr aktiv ist.
 * Ohne diesen Schutz bliebe die Leiter für einen hart gestorbenen
 * Hintergrundlauf für immer bei "KI-Auswertung läuft" stehen. Fallseite,
 * Dashboard und Review-Seite rufen dieselbe Funktion auf, damit derselbe Fall
 * an allen drei Stellen dieselbe Aussage trifft.
 *
 * `aiCheckRunning` MUSS aus `isAnyAiCheckRunning` stammen, nicht aus
 * `isAiCheckRunning`: Letzteres kennt nur den manuellen Sammel-Lauf und hielte
 * jeden frischen Einzel-Upload für unterbrochen.
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
