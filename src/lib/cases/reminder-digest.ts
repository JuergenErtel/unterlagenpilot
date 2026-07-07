import type { OverdueCase } from "@/lib/cases/reminders";

export interface ReminderDigest {
  subject: string;
  text: string;
}

/**
 * Baut die Wiedervorlage-Digest-E-Mail an den Vermittler: eine Liste überfälliger
 * Fälle mit Direktlink auf die Nachrichten-Seite (dort 1 Klick zum Erinnern).
 */
export function buildReminderDigest(
  brokerFirstName: string,
  cases: OverdueCase[],
  baseUrl: string
): ReminderDigest {
  const n = cases.length;
  const subject = `Wiedervorlage: ${n} überfällige${n === 1 ? "r Fall" : " Fälle"}`;

  const lines = cases.map(
    (c) =>
      `• ${c.caseNumber} – ${c.kundenName} – seit ${c.daysSince} Tagen keine Uploads, ${c.missingCount} Unterlage(n) offen\n  ${baseUrl}/cases/${c.caseId}/messages`
  );

  const text = [
    `Hallo ${brokerFirstName},`,
    "",
    n === 1
      ? "ein Fall wartet seit Längerem auf Unterlagen vom Kunden:"
      : `${n} Fälle warten seit Längerem auf Unterlagen vom Kunden:`,
    "",
    ...lines,
    "",
    "Über den jeweiligen Link können Sie mit einem Klick eine Erinnerung senden.",
    "",
    "— BaufiDesk",
  ].join("\n");

  return { subject, text };
}
