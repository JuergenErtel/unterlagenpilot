"use server";

import { getEnv } from "@/lib/env";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { mailAntragWartet } from "@/lib/email/auth-mails";
import { PLAN_DEFINITIONS } from "@/lib/saas/plans";
import { prisma } from "@/lib/db";

/** Meldet dem Betreiber, dass eine bestaetigte Anmeldung wartet. Scheitert
 *  irgendein Schritt (DB-Abfrage, Tarif-Auflösung, Versand), bleibt der Antrag
 *  trotzdem in /admin/anmeldungen sichtbar – die E-Mail-Bestaetigung des
 *  Antragstellers ist zu diesem Zeitpunkt bereits abgeschlossen und darf durch
 *  diesen rein informativen Nebeneffekt nicht mehr scheitern koennen. */
export async function benachrichtigeBetreiber(email: string, firmenname: string): Promise<void> {
  try {
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
    await sendEmail({ to: env.PLATFORM_ADMIN_EMAIL, subject: mail.subject, text: mail.text });
  } catch (e) {
    // Ohne Adresse/Namen loggen – nur, dass die Benachrichtigung scheiterte.
    console.error("[registrierung] Betreiber-Benachrichtigung fehlgeschlagen:", e);
  }
}
