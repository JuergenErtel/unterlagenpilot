/**
 * Auswahl von Fällen, deren Aufbewahrungsfrist abgelaufen ist (Auto-Löschung).
 * Rein (ohne I/O). Bewusst konservativ: nur TERMINALE Fälle, nur bei gesetzter
 * Frist (> 0), erst nach Ablauf.
 */

// Nur wirklich abgeschlossene Fälle kommen für die Auto-Löschung infrage.
const TERMINAL_STATUSES = new Set(["abgeschlossen", "archiviert"]);

export interface RetentionCase {
  caseId: string;
  caseNumber: string;
  status: string;
  updatedAt: Date;
  retentionDays: number;
}

export interface ExpiredCase extends RetentionCase {
  ageDays: number;
}

const MS_PER_DAY = 86400 * 1000;

export function selectExpiredCases(cases: RetentionCase[], now: Date): ExpiredCase[] {
  const out: ExpiredCase[] = [];
  for (const c of cases) {
    if (c.retentionDays <= 0) continue; // 0 = Aufbewahrung bis manuelle Löschung
    if (!TERMINAL_STATUSES.has(c.status)) continue;
    const ageDays = Math.floor((now.getTime() - c.updatedAt.getTime()) / MS_PER_DAY);
    if (ageDays >= c.retentionDays) out.push({ ...c, ageDays });
  }
  return out;
}

export interface AbandonedSelfDisclosure {
  id: string;
  /** Ablauf des zugehörigen Links – nicht des Bogens selbst. */
  linkExpiresAt: Date;
}

/**
 * Abgebrochene Bögen eines Anfrageformulars: `caseId` ist null (nie ein Fall
 * entstanden) und der zugehörige Link ist abgelaufen. Ohne diesen Schritt
 * blieben sie für immer liegen – unsichtbar für den Vermittler, von der
 * Aufbewahrungslogik oben nicht erfasst (die arbeitet nur auf TERMINALEN
 * FÄLLEN) und ohne Einwilligung gespeichert (die wird erst bei der
 * Fallgeburt geschrieben). Der Tokenablauf sperrt nur den Zugriff – die Zeile
 * selbst muss hier aktiv weggeräumt werden.
 */
export function selectAbandonedSelfDisclosures(
  rows: AbandonedSelfDisclosure[],
  now: Date
): AbandonedSelfDisclosure[] {
  return rows.filter((r) => r.linkExpiresAt < now);
}
