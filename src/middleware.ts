import { NextResponse, type NextRequest } from "next/server";
import { SITE_GATE_COOKIE, verifyGateToken } from "@/lib/security/site-gate";

/**
 * Globaler Passwortschutz (Site-Gate) für den Pilotbetrieb.
 *
 * Ist `SITE_GATE_PASSWORD` gesetzt, muss jede/r Besucher/in einmalig das
 * geteilte Passwort eingeben, bevor die App überhaupt erreichbar ist. Ohne die
 * Variable ist das Gate deaktiviert (Dev/Demo unverändert).
 *
 * Bewusst ausgenommen (dürfen NIE hinter dem Gate liegen):
 *  - `/upload/*`      Kunden-Upload-Links (Externe kennen das Gate-Passwort nicht)
 *  - `/api/cron/*`    Vercel-Cron (per CRON_SECRET geschützt)
 *  - `/monitoring`    Sentry-Tunnel (Fehler-Reports)
 *  - `/gate`, `/api/gate`  das Gate selbst
 */

const PUBLIC_PREFIXES = [
  "/upload",
  "/api/cron",
  "/monitoring",
  "/gate",
  "/api/gate",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(req: NextRequest) {
  const password = process.env.SITE_GATE_PASSWORD;
  // Gate deaktiviert, solange kein Passwort gesetzt ist.
  if (!password) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = req.cookies.get(SITE_GATE_COOKIE)?.value;
  if (await verifyGateToken(token, password)) return NextResponse.next();

  // Kein/ungültiger Nachweis → auf die Passwort-Seite umleiten und Ziel merken.
  const gateUrl = req.nextUrl.clone();
  gateUrl.pathname = "/gate";
  gateUrl.search = "";
  const next = pathname + search;
  if (next && next !== "/") gateUrl.searchParams.set("next", next);
  return NextResponse.redirect(gateUrl);
}

export const config = {
  // Alles außer Next-internen Assets und statischen Dateien.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|icon.png|apple-icon.png|opengraph-image.png).*)",
  ],
};
