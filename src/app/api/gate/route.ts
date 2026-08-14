import { NextResponse, type NextRequest } from "next/server";
import {
  SITE_GATE_COOKIE,
  SITE_GATE_MAX_AGE_SEC,
  computeGateToken,
  verifyGatePassword,
} from "@/lib/security/site-gate";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Nur seiteninterne Pfade als Weiterleitungsziel zulassen (kein Open Redirect). */
function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/** Wie in den Server-Actions: x-real-ip setzt Vercel, ist also nicht fälschbar. */
function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const password = process.env.SITE_GATE_PASSWORD;
  const form = await req.formData();
  const next = safeNext(form.get("next"));

  // Gate nicht aktiv → einfach durchlassen.
  if (!password) {
    return NextResponse.redirect(new URL(next, req.url), 303);
  }

  const zurueck = (grund: "1" | "zu-viele") => {
    const back = new URL("/gate", req.url);
    back.searchParams.set("error", grund);
    if (next !== "/") back.searchParams.set("next", next);
    return NextResponse.redirect(back, 303);
  };

  /*
   * Bremse gegen das Durchprobieren. Das Gate schützt ein GETEILTES Passwort –
   * die schwächste Art von Geheimnis – und ist im Pilotbetrieb die einzige
   * Hürde vor echten Kundendaten. Die Domain wird nachweislich automatisiert
   * abgeklopft (Sonden auf `.env`, `/.git/HEAD`, PHP-Hintertüren, mehrmals pro
   * Woche), und ohne Bremse darf ein Angreifer beliebig oft raten.
   *
   * Bewusst dieselbe Stellschraube wie der Login (LOGIN_RATE_*): zwei Regler
   * für dieselbe Frage würden nur auseinanderlaufen. Die Sperre gilt je
   * IP-Adresse und trifft deshalb nicht alle Besucher.
   *
   * Sie greift VOR dem Passwortvergleich – sonst käme der Angreifer beim
   * Treffer noch durch, obwohl er längst gesperrt sein müsste.
   */
  const env = getEnv();
  const ip = clientIp(req);
  const limit = await checkRateLimit(`gate:${ip}`, env.LOGIN_RATE_MAX, env.LOGIN_RATE_WINDOW_SEC);
  if (!limit.ok) {
    console.warn(`gate.rate_limited ip=${ip} retry_in=${limit.retryAfterSec}s`);
    return zurueck("zu-viele");
  }

  const ok = await verifyGatePassword(form.get("password"), password);

  if (!ok) {
    // Datenarmes Server-Log zur Missbrauchserkennung – wie bei auth.login_failed.
    // Kein Passwort, kein Versuch, nur die Adresse.
    console.warn(`gate.failed ip=${ip}`);
    return zurueck("1");
  }

  const token = await computeGateToken(password);
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SITE_GATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SITE_GATE_MAX_AGE_SEC,
  });
  return res;
}
