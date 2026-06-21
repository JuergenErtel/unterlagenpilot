import crypto from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * Signierte, tokenbasierte Upload-Links ohne Kundenlogin.
 * Token = base64url(payload).signature. Zugriff nur auf den eigenen Fall,
 * Ablaufdatum erzwungen. Keine Rückschlüsse ohne Secret möglich.
 */
export interface UploadTokenPayload {
  caseId: string;
  linkId: string;
  exp: number; // Unix-Sekunden
}

function sign(data: string): string {
  const secret = getEnv().UPLOAD_TOKEN_SECRET;
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export function createUploadToken(payload: UploadTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyUploadToken(token: string): UploadTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  // Konstante-Zeit-Vergleich gegen Timing-Angriffe.
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as UploadTokenPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * Deterministischer Hash des (Klartext-)Tokens für die Speicherung.
 * Wir speichern NIE das Klartext-Token in der DB, sondern nur diesen Hash –
 * so ist ein DB-Leak nicht direkt als gültiger Upload-Link verwendbar.
 */
export function hashToken(token: string): string {
  const secret = getEnv().UPLOAD_TOKEN_SECRET;
  return crypto.createHmac("sha256", secret).update(`uplink:${token}`).digest("base64url");
}
