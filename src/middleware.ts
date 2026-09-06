import { NextResponse, type NextRequest } from "next/server";
import { SITE_GATE_COOKIE, verifyGateToken } from "@/lib/security/site-gate";
import { isPublicPath } from "@/lib/security/public-paths";

/**
 * Globaler Passwortschutz (Site-Gate) für den Pilotbetrieb.
 *
 * Ist `SITE_GATE_PASSWORD` gesetzt, muss jede/r Besucher/in einmalig das
 * geteilte Passwort eingeben, bevor die App überhaupt erreichbar ist. Ohne die
 * Variable ist das Gate deaktiviert (Dev/Demo unverändert).
 *
 * Welche Pfade ausgenommen sind (Landingpage, Kundenstrecken, Rechtsseiten,
 * Magic Links), steht mit Begruendung in `src/lib/security/public-paths.ts`.
 */

/**
 * Content-Security-Policy mit per-Request-Nonce.
 *
 * Lebt hier statt in `next.config.mjs`, weil eine Nonce pro Request erzeugt
 * werden muss – statische Header koennen das nicht. Next.js liest die Nonce
 * aus dem CSP-*Request*-Header und traegt sie in seine eigenen Inline-Skripte
 * ein; Voraussetzung ist, dass jede Seite dynamisch gerendert wird
 * (`dynamic = "force-dynamic"` im Root-Layout – eine gecachte Seite truege
 * die Nonce des ERSTEN Besuchers und wuerde fuer alle weiteren blockiert).
 *
 * `script-src`-Aufbau (Produktion): CSP3-Browser sehen nur
 * `'nonce-…' 'strict-dynamic'` (Skripte brauchen die Nonce, duerfen aber
 * weitere Skripte nachladen – so laedt Next seine Chunks). Aeltere Browser
 * ignorieren `'strict-dynamic'` und fallen auf `'self'` zurueck;
 * `'unsafe-inline'` ist nur noch der Fallback fuer CSP1-Browser, die keine
 * Nonces kennen – alle anderen ignorieren es, sobald eine Nonce da ist.
 * Im Dev-Modus bleibt die alte laxe Policy (HMR braucht eval + WebSocket).
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  // Ziel fuer den Browser-Direkt-Upload (Supabase Storage) muss in
  // connect-src stehen, sonst blockt die CSP den PUT.
  let supabaseConnectSrc = "https://*.supabase.co";
  try {
    if (process.env.SUPABASE_URL) supabaseConnectSrc = new URL(process.env.SUPABASE_URL).origin;
  } catch {
    /* Wildcard-Fallback bleibt */
  }
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'`;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // 'self' (nicht 'none'): das Review-Center bettet die eigene
    // Dokument-Vorschau (/api/documents/.../download) per iframe ein.
    "frame-ancestors 'self'",
    "form-action 'self'",
    // Die Dokument-Vorschau (/api/documents/.../download?preview=1) leitet
    // auf eine signierte Supabase-Storage-URL um. Der Browser prueft das
    // Umleitungsziel gegen img-src bzw. frame-src – ohne den Storage-Origin
    // hier blieb jede Vorschau (Arbeitsplatz, Review-Center) leer, und zwar
    // ohne sichtbaren Fehler (Juergen, 01.09.2026: "keine Vorschau zu sehen").
    `img-src 'self' data: blob: ${supabaseConnectSrc}`,
    `frame-src 'self' ${supabaseConnectSrc}`,
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    `connect-src 'self' ${supabaseConnectSrc}${isDev ? " ws: wss:" : ""}`,
  ].join("; ");
}

export async function middleware(req: NextRequest) {
  // Nonce pro Request (Web Crypto – die Middleware laeuft ohne node:crypto).
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...nonceBytes));
  const csp = buildCsp(nonce);
  // Der Request-Header transportiert die Nonce zu Next.js (fuer dessen
  // Inline-Skripte), der Response-Header setzt die Policy im Browser durch.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const pass = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  const password = process.env.SITE_GATE_PASSWORD;
  // Gate deaktiviert, solange kein Passwort gesetzt ist.
  if (!password) return pass();

  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) return pass();

  const token = req.cookies.get(SITE_GATE_COOKIE)?.value;
  if (await verifyGateToken(token, password)) return pass();

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
