/**
 * Text der Mail, mit der das Backoffice einem Auftraggeber seinen
 * Einreichungslink schickt. Reine Funktion – der Versand steht in
 * einreichung.ts, damit der Text ohne Netz testbar bleibt.
 *
 * Klartext, kein HTML: Die Adresse des Auftraggebers ist eine Eingabe, der
 * Link ein Geheimnis. Beides gehoert nicht in gerendertes Markup.
 */
export interface EinreichungsLinkMailInput {
  url: string;
  backofficeName: string;
  /** Wer die Mail ausloest – steht unter dem Text. */
  absenderName: string;
  auftraggeberName: string;
  /** Anrede, wenn ein Kontakt gewaehlt wurde; sonst leer. */
  empfaengerName?: string | null;
  /** Persoenliche Zeile des Managers, optional. */
  notiz?: string | null;
}

/** Zeilenumbrueche und Steuerzeichen aus Eingaben, die in die Mail wandern. */
function einzeilig(s: string | null | undefined): string {
  return (s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

export function baueEinreichungsLinkMail(input: EinreichungsLinkMailInput): { subject: string; text: string } {
  const backoffice = einzeilig(input.backofficeName) || "unser Backoffice";
  const anrede = einzeilig(input.empfaengerName) ? `Guten Tag ${einzeilig(input.empfaengerName)},` : "Guten Tag,";
  const notiz = (input.notiz ?? "").replace(/\r\n?/g, "\n").trim();

  const zeilen = [
    anrede,
    "",
    `über den folgenden Link reichen Sie Finanzierungsfälle bei ${backoffice} zur Aufbereitung ein:`,
    "",
    input.url,
    "",
    "So funktioniert es:",
    "- Der Link ist Ihr persönlicher Zugang und gilt dauerhaft. Bitte geben Sie ihn nicht weiter.",
    "- Je Fall füllen Sie die kurze Maske aus (Antragsteller, Auftragsart, Ihre Referenz).",
    "- Direkt danach erhalten Sie einen Upload-Zugang für die Unterlagen; er gilt 72 Stunden.",
    "- Rückfragen und das Ergebnis erhalten Sie persönlich von uns.",
  ];
  if (notiz) zeilen.push("", notiz);
  zeilen.push("", "Mit freundlichen Grüßen", einzeilig(input.absenderName) || backoffice, backoffice);

  return {
    subject: `Ihr Einreichungslink für ${backoffice}`,
    text: zeilen.join("\n"),
  };
}
