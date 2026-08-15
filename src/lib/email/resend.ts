import { getEnv } from "@/lib/env";

/**
 * Schlanker Resend-E-Mail-Client (fetch-basiert, keine zusätzliche Dependency).
 * Versand ist nur aktiv, wenn RESEND_API_KEY UND EMAIL_FROM gesetzt sind –
 * sonst bleiben Nachrichten reine Copy-Paste-Vorlagen.
 */
export function isEmailConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

/**
 * Wer bekommt die Mail? "kunde" heisst: ein Antragsteller oder eine andere
 * externe Person aus einem Fall. "intern" heisst: Vermittler, Kollegen,
 * Registrierungs-Interessenten, Betreiber.
 *
 * Bewusst ein PFLICHTFELD ohne Vorgabewert: Ein Vorgabewert "intern" wuerde
 * jeden kuenftigen Versandweg stillschweigend als unkritisch einstufen.
 *
 * In der Stufe "nur_intern" (siehe MAILVERSAND) entscheidet dieses Feld nicht
 * darueber, OB umgeleitet wird (das passiert fuer beide Klassen, damit dort
 * niemals eine echte externe Adresse angeschrieben wird) – wohl aber ist es
 * die Grundlage dafuer, den urspruenglichen Empfaenger im Betreff auszuweisen.
 */
export type Empfaengerklasse = "intern" | "kunde";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  empfaenger: Empfaengerklasse;
  /**
   * Anzeigename des Absenders – im Posteingang steht dann dieser Name statt
   * des Produktnamens. Fuer Kundenmails gehoert hier der Name der Organisation
   * hin: Der Interessent kennt seinen Vermittler, nicht das Werkzeug, mit dem
   * dieser arbeitet. Die Adresse bleibt unveraendert die aus EMAIL_FROM, denn
   * nur deren Domain ist beim Versanddienst verifiziert.
   */
  absenderName?: string;
}

/**
 * Baut den Absenderkopf: Anzeigename der Organisation, Adresse aus EMAIL_FROM.
 *
 * Der Name kommt aus der Datenbank und damit aus einer Eingabe – Zeilenumbrueche
 * darin wuerden weitere Kopfzeilen in die Mail schmuggeln (Header-Injection),
 * Anfuehrungszeichen und spitze Klammern den Kopf zerreissen. Deshalb werden
 * sie entfernt, statt sie zu maskieren: Ein Vermittlername braucht sie nicht.
 */
export function absenderKopf(emailFrom: string, name?: string): string {
  const sauber = (name ?? "").replace(/[<>"\r\n]/g, "").trim();
  if (!sauber) return emailFrom;
  const adresse = emailFrom.match(/<([^>]+)>/)?.[1] ?? emailFrom.trim();
  return `${sauber} <${adresse}>`;
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error("E-Mail-Versand ist nicht eingerichtet (RESEND_API_KEY / EMAIL_FROM fehlen).");
  }

  // "aus": nichts verlaesst das System, auch keine internen Mails. Ein lauter
  // Fehler statt eines stillen Erfolgs, sonst markiert der Aufrufer (z.B.
  // sendMessageByEmail) eine nie versendete Nachricht als versendet.
  if (env.MAILVERSAND === "aus") {
    throw new Error("Der Mailversand ist derzeit ausgeschaltet.");
  }

  let ziel = input.to;
  let betreff = input.subject;
  let text = input.text;

  // Alles ausser dem ausdruecklichen "kunden" gilt als "nur_intern" - auch
  // ein unbekannter/fehlender Wert. So bleibt die sichere Vorgabe verlaesslich,
  // selbst wenn getEnv() (z.B. in einem Test) nicht ueber das Zod-Schema mit
  // seinem eigenen Fallback gelaufen ist.
  if (env.MAILVERSAND !== "kunden") {
    // Ohne Betreiberadresse gibt es keinen sicheren Umleitungsort - dann
    // verhaelt sich diese Stufe wie "aus" (fail-closed), statt ungeprueft an
    // die echte Adresse zu senden.
    if (!env.PLATFORM_ADMIN_EMAIL) {
      console.error(
        "[email] MAILVERSAND=nur_intern, aber PLATFORM_ADMIN_EMAIL fehlt - Versand faellt fail-closed aus wie bei 'aus'."
      );
      throw new Error("Der Mailversand ist derzeit ausgeschaltet.");
    }
    const gehtOhnehinAnBetreiber =
      input.to.trim().toLowerCase() === env.PLATFORM_ADMIN_EMAIL.trim().toLowerCase();
    // Ohne diese Ausnahme wuerde eine Mail, die schon an die Betreiberadresse
    // geht (z.B. "neue Anmeldung wartet"), sinnlos auf sich selbst verweisen.
    if (!gehtOhnehinAnBetreiber) {
      ziel = env.PLATFORM_ADMIN_EMAIL;
      betreff = `[Testbetrieb → ${input.to}] ${input.subject}`;
      text = `Testbetrieb: Diese Mail ging eigentlich an ${input.to}.\n\n${input.text}`;
    }
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: absenderKopf(env.EMAIL_FROM, input.absenderName),
      to: ziel,
      subject: betreff,
      text,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    // Anbieter-Fehlermeldung mitnehmen (z.B. "domain not verified"),
    // damit Versandfehler im Log diagnostizierbar sind – ohne Kundendaten.
    const body = await res.text().catch(() => "");
    throw new Error(`Resend HTTP ${res.status}${body ? `: ${body.slice(0, 400)}` : ""}`);
  }

  const data = (await res.json()) as { id?: string };
  return { id: data.id ?? "" };
}
