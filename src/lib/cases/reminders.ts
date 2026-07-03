/**
 * Auswahl überfälliger Fälle für die Wiedervorlage-Digest an den Vermittler.
 * Rein (ohne I/O), damit die Fälligkeits-Logik testbar bleibt.
 */

// Status, in denen noch Unterlagen ausstehen (Wiedervorlage sinnvoll).
export const OPEN_STATUSES_LIST = [
  "neu",
  "upload_offen",
  "ki_pruefung_laeuft",
  "unterlagen_fehlen",
  "vermittlerpruefung_erforderlich",
] as const;
const OPEN_STATUSES = new Set<string>(OPEN_STATUSES_LIST);

export interface ReminderCase {
  caseId: string;
  caseNumber: string;
  status: string;
  hasActiveLink: boolean;
  /** Letzte Kundenaktivität (neuester Kunden-Upload) bzw. Link-Erstellung, wenn nie hochgeladen. */
  lastCustomerActivityAt: Date | null;
  kundenName: string;
  missingCount: number;
}

export interface OverdueCase extends ReminderCase {
  daysSince: number;
}

const MS_PER_DAY = 86400 * 1000;

export function selectOverdueCases(
  cases: ReminderCase[],
  now: Date,
  thresholdDays: number
): OverdueCase[] {
  const out: OverdueCase[] = [];
  for (const c of cases) {
    if (!c.hasActiveLink) continue;
    if (c.missingCount <= 0) continue;
    if (!OPEN_STATUSES.has(c.status)) continue;
    if (!c.lastCustomerActivityAt) continue;
    const daysSince = Math.floor((now.getTime() - c.lastCustomerActivityAt.getTime()) / MS_PER_DAY);
    if (daysSince >= thresholdDays) out.push({ ...c, daysSince });
  }
  // Am längsten überfällige zuerst.
  return out.sort((a, b) => b.daysSince - a.daysSince);
}
