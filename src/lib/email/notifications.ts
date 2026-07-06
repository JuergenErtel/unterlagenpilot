/**
 * Reine Bausteine für System-Benachrichtigungen per E-Mail (ohne Netzwerk/DB,
 * damit sie isoliert testbar sind). Der Versand selbst läuft über resend.ts.
 */

export interface UploadNotificationInput {
  caseNumber: string;
  kundeName: string;
  count: number;
  caseUrl: string;
}

/** Benachrichtigung an den Vermittler, wenn ein Kunde neue Unterlagen hochlädt. */
export function buildUploadNotification(input: UploadNotificationInput): {
  subject: string;
  text: string;
} {
  const who = input.kundeName.trim() || "Ein Kunde";
  const subject = `Neue Unterlagen – Fall ${input.caseNumber}`;
  const text =
    `${who} hat ${input.count} Datei(en) zu Fall ${input.caseNumber} hochgeladen.\n\n` +
    `Zur Fallakte: ${input.caseUrl}`;
  return { subject, text };
}
