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

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error("E-Mail-Versand ist nicht konfiguriert (RESEND_API_KEY / EMAIL_FROM fehlen).");
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
