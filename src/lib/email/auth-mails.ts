/**
 * Reine Textbausteine fuer die Zugangs-Mails (ohne Netzwerk/DB, damit sie
 * isoliert pruefbar sind – gleiches Muster wie notifications.ts). Der Versand
 * laeuft ueber resend.ts.
 */

function datum(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const GRUSS = "Viele Grüße\nIhr BaufiDesk-Team";

export function mailBestaetigung(input: { name: string; url: string }): { subject: string; text: string } {
  return {
    subject: "BaufiDesk – bitte bestätigen Sie Ihre E-Mail-Adresse",
    text:
      `Hallo ${input.name},\n\n` +
      `vielen Dank für Ihr Interesse an BaufiDesk. Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse:\n\n` +
      `${input.url}\n\n` +
      `Der Link ist 48 Stunden gültig.\n\n` +
      `Danach wird Ihre Anmeldung von uns von Hand geprüft und freigeschaltet – Sie bekommen ` +
      `dazu eine weitere E-Mail. Wenn Sie sich nicht angemeldet haben, ignorieren Sie diese Nachricht einfach.\n\n` +
      GRUSS,
  };
}

export function mailAdresseVergeben(input: { loginUrl: string; resetUrl: string }): {
  subject: string;
  text: string;
} {
  return {
    subject: "BaufiDesk – Zugang bereits vorhanden",
    text:
      `Hallo,\n\n` +
      `für diese E-Mail-Adresse besteht bereits ein Zugang zu BaufiDesk. Eine neue Anmeldung ist ` +
      `deshalb nicht nötig.\n\n` +
      `Anmelden: ${input.loginUrl}\n` +
      `Passwort vergessen: ${input.resetUrl}\n\n` +
      `Wenn Sie das nicht waren, können Sie diese Nachricht ignorieren.\n\n` +
      GRUSS,
  };
}

export function mailAntragWartet(input: {
  firmenname: string;
  name: string;
  email: string;
  wunschtarif: string | null;
  adminUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `Neue Anmeldung: ${input.firmenname}`,
    text:
      `Eine bestätigte Anmeldung wartet auf Freigabe.\n\n` +
      `Firma:       ${input.firmenname}\n` +
      `Name:        ${input.name}\n` +
      `E-Mail:      ${input.email}\n` +
      `Wunschtarif: ${input.wunschtarif ?? "keine Angabe"}\n\n` +
      `Prüfen und freigeben: ${input.adminUrl}`,
  };
}

export function mailWillkommen(input: {
  name: string;
  organisation: string;
  tarif: string;
  testEndeAm: Date | null;
  loginUrl: string;
}): { subject: string; text: string } {
  const frist = input.testEndeAm
    ? `Ihr Testzeitraum läuft bis zum ${datum(input.testEndeAm)}.\n\n`
    : "";
  return {
    subject: "BaufiDesk – Ihr Zugang ist freigeschaltet",
    text:
      `Hallo ${input.name},\n\n` +
      `Ihr Zugang für ${input.organisation} ist freigeschaltet. Sie können sich ab sofort mit Ihrer ` +
      `E-Mail-Adresse und dem bei der Anmeldung gewählten Passwort anmelden:\n\n` +
      `${input.loginUrl}\n\n` +
      `Tarif: ${input.tarif}\n` +
      frist +
      `Bei Fragen antworten Sie einfach auf diese E-Mail.\n\n` +
      GRUSS,
  };
}

export function mailPasswortReset(input: { url: string }): { subject: string; text: string } {
  return {
    subject: "BaufiDesk – neues Passwort setzen",
    text:
      `Hallo,\n\n` +
      `über diesen Link setzen Sie ein neues Passwort:\n\n` +
      `${input.url}\n\n` +
      `Der Link ist 1 Stunde gültig und lässt sich nur einmal verwenden. Wenn Sie kein neues ` +
      `Passwort angefordert haben, können Sie diese Nachricht ignorieren – Ihr bisheriges Passwort ` +
      `bleibt dann unverändert gültig.\n\n` +
      GRUSS,
  };
}

export function mailEinladung(input: {
  einladenderName: string;
  organisation: string;
  url: string;
}): { subject: string; text: string } {
  return {
    subject: `Einladung zu BaufiDesk – ${input.organisation}`,
    text:
      `Hallo,\n\n` +
      `${input.einladenderName} hat Sie zu BaufiDesk eingeladen (${input.organisation}). ` +
      `Über diesen Link vergeben Sie Ihr Passwort und schließen die Einrichtung ab:\n\n` +
      `${input.url}\n\n` +
      `Der Link ist 7 Tage gültig.\n\n` +
      GRUSS,
  };
}
