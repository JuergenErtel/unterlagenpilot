import crypto from "node:crypto";
import { cookies } from "next/headers";
import { verifySessionToken, readSessionToken } from "@/lib/auth/session";

/**
 * CSRF-Schutz für mutierende Aktionen (Double-Submit-Token).
 *
 * Next.js prüft bei Server Actions bereits den Origin gegen Same-Origin. Als
 * zweite, explizite Verteidigungslinie binden wir ein CSRF-Token an die Session:
 * Das Token steckt sowohl im signierten Session-Cookie (Feld `csrf`) als auch in
 * einem lesbaren Cookie, das Formulare als verstecktes Feld mitsenden. Eine
 * mutierende Aktion akzeptiert nur, wenn beide übereinstimmen.
 */
const CSRF_COOKIE = "up_csrf";

/** Liefert das an die aktuelle Session gebundene CSRF-Token (für Formularfelder). */
export async function getCsrfToken(): Promise<string | null> {
  const session = verifySessionToken(await readSessionToken());
  if (!session) return null;
  const store = await cookies();
  // Lesbares Spiegel-Cookie setzen, falls noch nicht vorhanden.
  if (store.get(CSRF_COOKIE)?.value !== session.csrf) {
    store.set(CSRF_COOKIE, session.csrf, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }
  return session.csrf;
}

/** Prüft das übermittelte CSRF-Token gegen das Session-gebundene Geheimnis. */
export async function assertCsrf(submitted: string | null | undefined): Promise<void> {
  const session = verifySessionToken(await readSessionToken());
  if (!session || !submitted) throw new Error("Sicherheitsprüfung fehlgeschlagen. Bitte Seite neu laden.");
  const a = Buffer.from(submitted);
  const b = Buffer.from(session.csrf);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Sicherheitsprüfung fehlgeschlagen. Bitte Seite neu laden.");
  }
}
