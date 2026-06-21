"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { getAuthProvider } from "@/lib/auth/provider";
import {
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
} from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";

export interface LoginState {
  error?: string;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown");
}

/** Nur relative, eigene Pfade erlauben (Schutz gegen Open-Redirect). */
function safeRedirect(target: string | null | undefined): string {
  if (!target) return "/dashboard";
  if (!target.startsWith("/") || target.startsWith("//")) return "/dashboard";
  return target;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const env = getEnv();
  const ip = await clientIp();
  const limit = rateLimit(`login:${ip}`, env.LOGIN_RATE_MAX, env.LOGIN_RATE_WINDOW_SEC);
  if (!limit.ok) {
    return { error: `Zu viele Versuche. Bitte in ${limit.retryAfterSec}s erneut versuchen.` };
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeRedirect(String(formData.get("next") ?? ""));
  if (!email || !password) return { error: "Bitte E-Mail und Passwort eingeben." };

  const user = await getAuthProvider().authenticate(email, password);
  if (!user) {
    // Keine User-Enumeration: identische Meldung für „kein User" und „falsches PW".
    // Kein DB-Audit (AuditLog erfordert eine gültige Organisation) – nur datenarmes
    // Server-Log zur Missbrauchserkennung, ohne E-Mail/Passwort.
    console.warn(`auth.login_failed ip=${ip}`);
    return { error: "E-Mail oder Passwort ist falsch." };
  }

  const token = createSessionToken({
    sub: user.id,
    org: user.organizationId,
    role: user.role,
    name: user.name,
  });
  await setSessionCookie(token);
  await audit({
    organizationId: user.organizationId,
    userId: user.id,
    action: "auth.login",
    entityType: "auth",
    metadata: { ip },
  });
  redirect(next);
}

export async function logout(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
