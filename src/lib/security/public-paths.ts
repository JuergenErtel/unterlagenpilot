/**
 * Welche Pfade OHNE das Site-Gate erreichbar sind.
 *
 * Eigenes Modul statt Konstante in der Middleware, damit die Regel testbar
 * ist, ohne `next/server` zu laden. Die Middleware wertet nur noch aus.
 *
 * Bewusst ausgenommen (duerfen NIE hinter dem Gate liegen):
 *  - `/`               Die Landingpage. Sie ist die einzige Seite, die von aussen
 *                      gefunden werden soll; alles dahinter (Login, Registrierung,
 *                      App) bleibt geschuetzt.
 *  - `/upload/*`       Kunden-Upload-Links (Externe kennen das Gate-Passwort nicht)
 *  - `/selbstauskunft/*` Kunden-Selbstauskunft (gleicher Grund)
 *  - `/anfrage/*`      Oeffentliches Anfrageformular
 *  - `/einreichen/*`   Einreichungslink des Backoffice (Externe ohne Konto, Geheimnis im Pfad)
 *  - `/datenschutz`, `/agb`, `/avv`, `/impressum` Oeffentliche Rechtsseiten. Die
 *    Kundenstrecke verlinkt neben dem Einwilligungs-Haekchen auf `/datenschutz`;
 *    landete der Klick hinter dem Gate, waere die Einwilligung wertlos. Das
 *    Impressum muss "leicht erkennbar, unmittelbar erreichbar" sein (§ 5 DDG).
 *  - `/api/cron/*`     Vercel-Cron (per CRON_SECRET geschuetzt)
 *  - `/api/eingang/*`  Geraete-Eingang des Apple-Kurzbefehls. Traegt sein eigenes
 *                      Geheimnis im Authorization-Header (persoenliches
 *                      Geraetetoken, an genau einen Nutzer gebunden). Das Gate
 *                      ist ein Browser-Cookie – ein Kurzbefehl hat keines.
 *  - `/monitoring`     Sentry-Tunnel (Fehler-Reports)
 *  - `/gate`, `/api/gate`  das Gate selbst
 *  - `/registrieren/bestaetigen/*`, `/passwort-neu/*`, `/einladung/*`
 *    Magic-Link-Strecken (tragen ihr eigenes Geheimnis im Pfad). Das
 *    Formular `/registrieren` selbst bleibt bewusst HINTER dem Gate.
 */
export const PUBLIC_PREFIXES = [
  "/upload",
  "/selbstauskunft",
  "/anfrage",
  "/einreichen",
  "/datenschutz",
  "/agb",
  "/avv",
  "/impressum",
  "/api/cron",
  "/api/eingang",
  "/monitoring",
  "/gate",
  "/api/gate",
  "/registrieren/bestaetigen",
  "/passwort-neu",
  "/einladung",
] as const;

export function isPublicPath(pathname: string): boolean {
  // Nur die Startseite selbst – nicht "alles, was mit / beginnt".
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
