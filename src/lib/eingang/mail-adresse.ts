import { getEnv } from "@/lib/env";

/**
 * Ob der Mail-Eingang eingerichtet ist und unter welcher Adresse.
 *
 * Bewusst getrennt von mail-abruf.ts: Diese beiden Auskuenfte braucht JEDE
 * Fallakte und die Verbindungsseite, der IMAP-Client dagegen nur der Cron.
 * Stuenden sie in derselben Datei, zoege jede Seite `imapflow` samt Anhang in
 * ihren Serverbundle.
 */

/** Ohne Benutzer, Passwort UND Anzeigeadresse ist der Weg ausgeschaltet. */
export function istMailEingangEingerichtet(): boolean {
  const env = getEnv();
  return Boolean(env.EINGANG_IMAP_USER && env.EINGANG_IMAP_PASSWORD && env.EINGANG_MAIL_ADRESSE);
}

/**
 * Die Adresse, die dem Nutzer angezeigt wird - oder null.
 *
 * null heisst "noch nicht eingerichtet". Die Oberflaeche sagt das dann auch,
 * statt eine Adresse anzubieten, an die man vergeblich schickt.
 */
export function mailEingangAdresse(): string | null {
  const env = getEnv();
  return istMailEingangEingerichtet() ? (env.EINGANG_MAIL_ADRESSE as string) : null;
}
