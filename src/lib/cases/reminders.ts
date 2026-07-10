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

export interface FollowupCandidate {
  caseId: string;
  caseNumber: string;
  kundenName: string;
  wiedervorlage: Date | null;
  /** Nächste offene, nicht erledigte Frist. */
  naechsteFrist: { title: string; dueDate: Date } | null;
  offeneBankforderungen: number;
}

export interface DueFollowup extends FollowupCandidate {
  grund: "wiedervorlage" | "frist" | "bank_nachforderung";
  /** Relevantes Datum (Wiedervorlage bzw. Frist); null bei Bank-Nachforderung ohne Frist. */
  faelligAm: Date | null;
}

/**
 * Wählt Fälle, bei denen der Vermittler HEUTE aktiv werden sollte: fällige
 * Wiedervorlage, fällige/überfällige Frist oder offene Bank-Nachforderung.
 * Rein, damit testbar. Fristen zählen ab `fristVorlaufTage` Tagen vor Ablauf.
 */
export function selectDueFollowups(
  cases: FollowupCandidate[],
  now: Date,
  fristVorlaufTage = 7
): DueFollowup[] {
  const out: DueFollowup[] = [];
  const vorlaufMs = fristVorlaufTage * MS_PER_DAY;
  for (const c of cases) {
    if (c.wiedervorlage && c.wiedervorlage.getTime() <= now.getTime()) {
      out.push({ ...c, grund: "wiedervorlage", faelligAm: c.wiedervorlage });
      continue;
    }
    if (c.naechsteFrist && c.naechsteFrist.dueDate.getTime() - now.getTime() <= vorlaufMs) {
      out.push({ ...c, grund: "frist", faelligAm: c.naechsteFrist.dueDate });
      continue;
    }
    if (c.offeneBankforderungen > 0) {
      out.push({ ...c, grund: "bank_nachforderung", faelligAm: c.naechsteFrist?.dueDate ?? null });
    }
  }
  // Am dringlichsten zuerst: frühestes Fälligkeitsdatum, fehlende Daten ans Ende.
  return out.sort((a, b) => (a.faelligAm?.getTime() ?? Infinity) - (b.faelligAm?.getTime() ?? Infinity));
}

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
