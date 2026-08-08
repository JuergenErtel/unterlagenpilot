"use server";

import { getEnv } from "@/lib/env";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { mailAntragWartet } from "@/lib/email/auth-mails";
import { PLAN_DEFINITIONS } from "@/lib/saas/plans";
import { prisma } from "@/lib/db";

/** Meldet dem Betreiber, dass eine bestaetigte Anmeldung wartet. Scheitert der
 *  Versand, bleibt der Antrag trotzdem in /admin/anmeldungen sichtbar. */
export async function benachrichtigeBetreiber(email: string, firmenname: string): Promise<void> {
  const env = getEnv();
  if (!env.PLATFORM_ADMIN_EMAIL || !isEmailConfigured()) return;

  const antrag = await prisma.signupRequest.findUnique({ where: { email } });
  const tarif = antrag?.wunschtarif ? PLAN_DEFINITIONS[antrag.wunschtarif].name : null;

  const mail = mailAntragWartet({
    firmenname,
    name: antrag?.name ?? "",
    email,
    wunschtarif: tarif,
    adminUrl: `${env.APP_BASE_URL.replace(/\/$/, "")}/admin/anmeldungen`,
  });
  try {
    await sendEmail({ to: env.PLATFORM_ADMIN_EMAIL, subject: mail.subject, text: mail.text });
  } catch (e) {
    console.error("[registrierung] Betreiber-Benachrichtigung fehlgeschlagen:", e);
  }
}
