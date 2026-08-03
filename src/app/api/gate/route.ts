import { NextResponse, type NextRequest } from "next/server";
import {
  SITE_GATE_COOKIE,
  SITE_GATE_MAX_AGE_SEC,
  computeGateToken,
} from "@/lib/security/site-gate";

export const dynamic = "force-dynamic";

/** Nur seiteninterne Pfade als Weiterleitungsziel zulassen (kein Open Redirect). */
function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function POST(req: NextRequest) {
  const password = process.env.SITE_GATE_PASSWORD;
  const form = await req.formData();
  const next = safeNext(form.get("next"));

  // Gate nicht aktiv → einfach durchlassen.
  if (!password) {
    return NextResponse.redirect(new URL(next, req.url), 303);
  }

  const entered = form.get("password");
  const ok = typeof entered === "string" && entered === password;

  if (!ok) {
    const back = new URL("/gate", req.url);
    back.searchParams.set("error", "1");
    if (next !== "/") back.searchParams.set("next", next);
    return NextResponse.redirect(back, 303);
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
