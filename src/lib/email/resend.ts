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
 */
export type Empfaengerklasse = "intern" | "kunde";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  empfaenger: Empfaengerklasse;
}

/** Darf an diese Adresse eine Kundenmail hinausgehen? */
export function kundenversandErlaubt(to: string): boolean {
  const env = getEnv();
  if (env.KUNDENVERSAND !== "an") return false;
  // Nicht gesetzt heisst "keine Einschraenkung". GESETZT heisst dagegen immer
  // "nur diese Adressen" – auch wenn nichts Brauchbares drinsteht. Vorher fiel
  // eine gesetzte, aber leere Variable auf "alle erlaubt" durch: ausgerechnet
  // die Variable, deren Zweck das gefahrlose Durchspielen ist, haette dann den
  // Versand an echte Kunden freigegeben.
  const roh = env.KUNDENVERSAND_NUR_AN;
  if (roh == null) return true;
  const liste = roh
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  return liste.includes(to.trim().toLowerCase());
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error("E-Mail-Versand ist nicht eingerichtet (RESEND_API_KEY / EMAIL_FROM fehlen).");
  }

  // Sperre VOR dem Netzwerkaufruf. Lieber ein lauter Fehler als eine Mail an
  // einen echten Antragsteller. Der Fehler nennt bewusst weder Betreff noch
  // Inhalt noch die Adresse.
  if (input.empfaenger === "kunde" && !kundenversandErlaubt(input.to)) {
    throw new Error(
      "Kundenversand gesperrt. Ohne KUNDENVERSAND=an (und ggf. Eintrag in KUNDENVERSAND_NUR_AN) geht nichts an Kunden hinaus."
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
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
