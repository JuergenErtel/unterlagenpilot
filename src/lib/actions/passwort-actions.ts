"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { mailPasswortReset } from "@/lib/email/auth-mails";
import { fordereResetAn, setzeNeuesPasswort } from "@/lib/auth/passwort";
import type { UserRole } from "@/lib/domain/enums";

export interface PasswortState {
  ok?: boolean;
  error?: string;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Fordert einen Reset-Link an. Die Antwort ist IMMER dieselbe – ob die Adresse
 *  existiert, darf das Formular nicht verraten. */
export async function resetAnfordern(
  _prev: PasswortState,
  formData: FormData
): Promise<PasswortState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const ip = await clientIp();
  const limit = await checkRateLimit(`pwreset:${ip}`, 5, 3600);
  // Auch bei erreichtem Limit dieselbe Antwort: sonst wird das Limit selbst zum
  // Signal, dass jemand an dieser Adresse dran ist.
  if (!limit.ok || !email || !isEmailConfigured()) return { ok: true };

  const angefordert = await fordereResetAn(email);
  if (angefordert) {
    const mail = mailPasswortReset({
      url: `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/passwort-neu/${angefordert.token}`,
    });
    try {
      await sendEmail({ to: email, subject: mail.subject, text: mail.text, empfaenger: "intern" });
    } catch (e) {
      console.error("[passwort] Reset-Mail fehlgeschlagen:", e);
    }
  }
  return { ok: true };
}

export async function passwortSetzen(
  _prev: PasswortState,
  formData: FormData
): Promise<PasswortState> {
  const token = String(formData.get("token") ?? "");
  const passwort = String(formData.get("passwort") ?? "");
  const wiederholung = String(formData.get("wiederholung") ?? "");
  if (passwort !== wiederholung) return { error: "Die beiden Passwörter stimmen nicht überein." };

  const res = await setzeNeuesPasswort(token, passwort);
  if (!res.ok) {
    return {
      error:
        res.grund === "passwort_schwach"
          ? (res.text ?? "Bitte ein längeres Passwort wählen.")
          : "Dieser Link ist abgelaufen oder wurde bereits verwendet.",
    };
  }

  const nutzer = await prisma.user.findUniqueOrThrow({ where: { id: res.userId } });
  await audit({
    organizationId: nutzer.organizationId,
    userId: nutzer.id,
    action: "user.password_reset",
    entityType: "user",
    entityId: nutzer.id,
  });

  await setSessionCookie(
    createSessionToken({
      sub: nutzer.id,
      org: nutzer.organizationId,
      role: nutzer.role as UserRole,
      name: nutzer.name,
    })
  );
  redirect("/dashboard");
}
