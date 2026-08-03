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
