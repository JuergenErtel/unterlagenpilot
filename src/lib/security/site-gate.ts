/**
 * Globaler Passwortschutz ("Site-Gate") für den Pilotbetrieb.
 *
 * Legt sich als grobe Zugangssperre VOR die gesamte App, damit während des
 * Tests mit echten Kundendaten nicht jeder baufidesk.de öffnen kann. Das ist
 * KEIN Ersatz für den eigentlichen Login/Session-Schutz (der bleibt dahinter),
 * sondern eine zusätzliche, geteilte Passwort-Hürde.
 *
 * Aktiviert wird das Gate ausschließlich durch Setzen von `SITE_GATE_PASSWORD`.
 * Ohne diese Variable ist das Gate aus (lokale Entwicklung/Demo unverändert).
 *
 * Die Implementierung nutzt Web Crypto (HMAC-SHA256) und läuft damit sowohl in
 * der Edge-Middleware als auch im Node-Route-Handler.
 */

export const SITE_GATE_COOKIE = "bfd_gate";
export const SITE_GATE_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 Tage

// Fester Payload: Der Cookie beweist nur die Kenntnis des Passworts, er
// enthält das Passwort selbst nie. Wird das Passwort rotiert, ändert sich der
// HMAC-Schlüssel und alle alten Cookies werden ungültig.
const TOKEN_PAYLOAD = "baufidesk-site-gate-v1";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Berechnet das Cookie-Token für ein gegebenes Passwort. */
export async function computeGateToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(TOKEN_PAYLOAD));
  return toHex(sig);
}

/** Zeitkonstanter Vergleich, um Timing-Rückschlüsse zu vermeiden. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Prüft, ob ein Cookie-Wert zum aktuellen Passwort passt. */
export async function verifyGateToken(
  token: string | undefined,
  password: string
): Promise<boolean> {
  if (!token) return false;
  const expected = await computeGateToken(password);
  return safeEqual(token, expected);
}
