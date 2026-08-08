"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { requireRole } from "@/lib/auth/context";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { mailEinladung } from "@/lib/email/auth-mails";
import {
  ladeEin,
  loeseEinladungEin,
  sendeEinladungErneut,
  zieheEinladungZurueck,
} from "@/lib/auth/invite";
import { checkLimit } from "@/lib/saas/plans";
import { USER_ROLES, type UserRole } from "@/lib/domain/enums";

export interface EinladungState {
  ok?: boolean;
  error?: string;
}

export async function einladenAction(
  _prev: EinladungState,
  formData: FormData
): Promise<EinladungState> {
  const ctx = await requireRole("org_admin");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const rolle = String(formData.get("rolle") ?? "") as UserRole;
  if (!name || !email) return { error: "Bitte Name und E-Mail angeben." };
  if (!USER_ROLES.includes(rolle)) return { error: "Bitte eine Rolle wählen." };

  const res = await ladeEin({
    organizationId: ctx.organizationId,
    email,
    name,
    rolle,
    einladenderUserId: ctx.userId,
  });

  if (!res.ok) {
    if (res.grund === "limit_erreicht") {
      const limit = await checkLimit(ctx.organizationId, "usersPerOrg");
      return {
        error: `Ihr Tarif erlaubt maximal ${limit.limit} Nutzer. Für weitere Plätze bitte den Tarif wechseln.`,
      };
    }
    // Hier ist Enumeration kein Thema: der Einladende sieht ohnehin seine
    // eigene Organisation und braucht eine brauchbare Fehlermeldung.
    return {
      error:
        res.grund === "adresse_vergeben"
          ? "Diese E-Mail-Adresse wird bereits verwendet."
          : "Diese Rolle ist in Ihrem Tarif nicht verfügbar.",
    };
  }

  if (isEmailConfigured()) {
    const mail = mailEinladung({
      einladenderName: ctx.userName,
      organisation: ctx.organizationName,
      url: `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/einladung/${res.token}`,
    });
    try {
      await sendEmail({ to: email, subject: mail.subject, text: mail.text });
    } catch (e) {
      console.error("[einladung] Mailversand fehlgeschlagen:", e);
      return { error: "Konto angelegt, aber die Einladungsmail konnte nicht zugestellt werden." };
    }
  }

  revalidatePath("/organization");
  return { ok: true };
}

/**
 * Verschickt eine noch nicht angenommene Einladung erneut.
 *
 * Rolle und Mandantengrenze werden HIER geprueft (requireRole gibt den Kontext
 * aus der Datenbank) und noch einmal in sendeEinladungErneut – eine Server
 * Action ist ein oeffentlicher Endpunkt.
 */
export async function einladungErneutSendenAction(
  _prev: EinladungState,
  formData: FormData
): Promise<EinladungState> {
  const ctx = await requireRole("org_admin");
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Keine Einladung angegeben." };

  const res = await sendeEinladungErneut({
    userId,
    organizationId: ctx.organizationId,
    handelnderUserId: ctx.userId,
  });
  if (!res.ok) {
    return { error: "Diese Einladung ist nicht mehr offen." };
  }

  if (isEmailConfigured()) {
    const mail = mailEinladung({
      einladenderName: ctx.userName,
      organisation: ctx.organizationName,
      url: `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/einladung/${res.token}`,
    });
    try {
      await sendEmail({ to: res.email, subject: mail.subject, text: mail.text });
    } catch (e) {
      console.error("[einladung] erneuter Mailversand fehlgeschlagen:", e);
      return { error: "Neuer Link erstellt, aber die Einladungsmail konnte nicht zugestellt werden." };
    }
  }

  revalidatePath("/organization");
  return { ok: true };
}

/** Zieht eine noch nicht angenommene Einladung zurueck und gibt den Tarifplatz frei. */
export async function einladungZurueckziehenAction(
  _prev: EinladungState,
  formData: FormData
): Promise<EinladungState> {
  const ctx = await requireRole("org_admin");
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Keine Einladung angegeben." };

  const res = await zieheEinladungZurueck({
    userId,
    organizationId: ctx.organizationId,
    handelnderUserId: ctx.userId,
  });
  if (!res.ok) {
    return {
      error:
        "Diese Einladung ist nicht mehr offen – sie wurde inzwischen angenommen oder zurückgezogen.",
    };
  }

  revalidatePath("/organization");
  return { ok: true };
}

export async function einladungEinloesenAction(
  _prev: EinladungState,
  formData: FormData
): Promise<EinladungState> {
  const token = String(formData.get("token") ?? "");
  const passwort = String(formData.get("passwort") ?? "");
  const wiederholung = String(formData.get("wiederholung") ?? "");
  if (passwort !== wiederholung) return { error: "Die beiden Passwörter stimmen nicht überein." };

  const res = await loeseEinladungEin(token, passwort);
  if (!res.ok) {
    return {
      error:
        res.grund === "passwort_schwach"
          ? (res.text ?? "Bitte ein längeres Passwort wählen.")
          : "Diese Einladung ist abgelaufen oder wurde bereits verwendet.",
    };
  }

  await setSessionCookie(
    createSessionToken({
      sub: res.userId,
      org: res.organizationId,
      role: res.role,
      name: res.name,
    })
  );
  redirect("/dashboard");
}
