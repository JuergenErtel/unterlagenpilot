"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { mailAdresseVergeben, mailBestaetigung } from "@/lib/email/auth-mails";
import { SIGNUP_EINGABE, erstelleAntrag } from "@/lib/auth/signup";

/**
 * Server Action der Registrierung. Enthaelt bewusst nur Validierung,
 * Rate-Limit, Mailwahl und Weiterleitung – die Fachlogik steht in
 * lib/auth/signup.ts.
 *
 * ACHTUNG: Diese Datei traegt "use server" – Next.js laesst hier
 * ausschliesslich async-Exporte zu (siehe auch lib/auth/redirect.ts). Eine
 * synchrone Hilfsfunktion bricht den Build, ohne dass typecheck oder Tests
 * etwas melden. Reine Hilfsfunktionen gehoeren deshalb in ein normales
 * Servermodul.
 *
 * Wichtig: Die Antwort ist bei "Adresse frei" und "Adresse vergeben"
 * IDENTISCH. Unterschiedlich ist nur, welche Mail rausgeht. Sonst wird das
 * Formular zum Kontopruefer.
 */
export interface RegistrierungState {
  ok?: boolean;
  error?: string;
  feldFehler?: Record<string, string>;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function basis(): string {
  return getEnv().APP_BASE_URL.replace(/\/$/, "");
}

export async function registriere(
  _prev: RegistrierungState,
  formData: FormData
): Promise<RegistrierungState> {
  // Ohne Mailversand kaeme die Bestaetigungsmail nie an – dann lieber gar kein
  // Antrag als einer, den niemand einloesen kann. Die Pruefung steht bewusst
  // HIER (nicht nur im Rendern der Seite): die Action ist ein oeffentlicher
  // Endpunkt und muss sich selbst schuetzen.
  if (!isEmailConfigured()) {
    return { error: "Die Registrierung ist derzeit nicht verfügbar. Bitte melden Sie sich per E-Mail." };
  }

  const geparst = SIGNUP_EINGABE.safeParse({
    name: formData.get("name") ?? "",
    firmenname: formData.get("firmenname") ?? "",
    email: formData.get("email") ?? "",
    telefon: formData.get("telefon") ?? "",
    passwort: formData.get("passwort") ?? "",
    wunschtarif: formData.get("wunschtarif") || undefined,
    agb: formData.get("agb") === "on",
  });

  if (!geparst.success) {
    const feldFehler: Record<string, string> = {};
    for (const issue of geparst.error.issues) {
      const feld = String(issue.path[0] ?? "");
      if (feld && !feldFehler[feld]) feldFehler[feld] = issue.message;
    }
    return { feldFehler };
  }

  const ip = await clientIp();
  const limit = await checkRateLimit(`signup:${ip}`, 5, 3600);
  if (!limit.ok) {
    return { error: `Zu viele Versuche. Bitte in ${Math.ceil(limit.retryAfterSec / 60)} Minuten erneut versuchen.` };
  }

  const ergebnis = await erstelleAntrag(geparst.data, { ip });

  // Zu schnell hintereinander: nach aussen dieselbe Antwort, aber keine Mail.
  if (ergebnis.status === "zu_haeufig") return { ok: true };

  try {
    if (ergebnis.status === "neu_angelegt") {
      const mail = mailBestaetigung({
        name: geparst.data.name,
        url: `${basis()}/registrieren/bestaetigen/${ergebnis.token}`,
      });
      await sendEmail({ to: geparst.data.email, subject: mail.subject, text: mail.text });
    } else {
      const mail = mailAdresseVergeben({
        loginUrl: `${basis()}/login`,
        resetUrl: `${basis()}/passwort-vergessen`,
      });
      await sendEmail({ to: geparst.data.email, subject: mail.subject, text: mail.text });
    }
  } catch (e) {
    // Ohne Adresse/Namen loggen – nur, dass der Versand scheiterte.
    console.error("[registrierung] Mailversand fehlgeschlagen:", e);
    return { error: "Die Bestätigungsmail konnte nicht versendet werden. Bitte später erneut versuchen." };
  }

  return { ok: true };
}

/** Getrennte Action fuer die Weiterleitung – redirect() wirft und darf deshalb
 *  nicht im try/catch des Mailversands stehen. */
export async function registriereUndWeiter(
  prev: RegistrierungState,
  formData: FormData
): Promise<RegistrierungState> {
  const res = await registriere(prev, formData);
  if (res.ok) redirect("/registrieren/danke");
  return res;
}
