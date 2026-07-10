import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import type { UserRole } from "@/lib/domain/enums";

/**
 * Session-Primitive ohne externe Abhängigkeit:
 *  - Passwort-Hashing via scrypt (node:crypto), niemals Klartext.
 *  - Stateless Session-Token (HMAC-signiert) in einem httpOnly-Cookie.
 * Bewusst providerneutral gehalten – NextAuth/Supabase Auth können den
 * AuthProvider (siehe provider.ts) später ersetzen, ohne diese Helfer zu brechen.
 */

// ---------------------------------------------------------------------------
// Passwort-Hashing (scrypt)
// ---------------------------------------------------------------------------

const SCRYPT_N = 16384; // CPU/Memory-Kostenfaktor
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString("base64url")}$${dk.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const [, nStr, saltB64, hashB64] = parts as [string, string, string, string];
  const n = Number(nStr);
  if (!Number.isFinite(n) || n < 1024) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64url");
    expected = Buffer.from(hashB64, "base64url");
  } catch {
    return false;
  }
  // Ein leeres Salt/Hash würde scryptSync(…, keylen 0) einen leeren Buffer liefern
  // lassen – timingSafeEqual(leer, leer) ist true und jedes Passwort gälte als korrekt.
  if (salt.length === 0 || expected.length !== SCRYPT_KEYLEN) return false;
  const actual = crypto.scryptSync(password, salt, expected.length, { N: n });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * Nie zutreffender, aber strukturell valider Hash. Vergleichsziel für nicht
 * existierende bzw. passwortlose Nutzer, damit die Antwortzeit nicht verrät, ob
 * ein Konto existiert.
 *
 * Bewusst LAZY: `session.ts` hängt an `auth/context.ts` und wird damit bei jedem
 * Seitenaufruf geladen. Eine scryptSync-Berechnung auf Modulebene kostete jeden
 * Kaltstart ~25 ms – auch bei Requests, die sich nie anmelden.
 */
let dummyPasswordHash: string | null = null;

export function getDummyPasswordHash(): string {
  dummyPasswordHash ??= hashPassword(crypto.randomBytes(32).toString("hex"));
  return dummyPasswordHash;
}

// ---------------------------------------------------------------------------
// Session-Token (HMAC)
// ---------------------------------------------------------------------------

export interface SessionPayload {
  sub: string; // userId
  org: string; // organizationId
  role: UserRole;
  name: string;
  csrf: string; // CSRF-Geheimnis (Double-Submit)
  iat: number; // Unix-Sekunden
  exp: number; // Unix-Sekunden
}

function sign(data: string): string {
  return crypto.createHmac("sha256", getEnv().AUTH_SECRET).update(data).digest("base64url");
}

export function createSessionToken(
  input: Omit<SessionPayload, "iat" | "exp" | "csrf"> & { csrf?: string }
): string {
  const ttlSec = getEnv().SESSION_TTL_HOURS * 3600;
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ...input,
    csrf: input.csrf ?? crypto.randomBytes(16).toString("base64url"),
    iat: now,
    exp: now + ttlSec,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = sign(body);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie-Handling
// ---------------------------------------------------------------------------

export async function setSessionCookie(token: string): Promise<void> {
  const env = getEnv();
  const store = await cookies();
  store.set(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 3600,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(getEnv().SESSION_COOKIE_NAME);
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(getEnv().SESSION_COOKIE_NAME)?.value;
}
