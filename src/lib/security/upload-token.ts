import crypto from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * Signierte, tokenbasierte Upload-Links ohne Kundenlogin.
 * Token = base64url(payload).signature. Zugriff nur auf den eigenen Fall,
 * Ablaufdatum erzwungen. Keine Rückschlüsse ohne Secret möglich.
 */
export interface UploadTokenPayload {
  /**
   * Fehlt beim Anfrageformular: Dort gibt es beim Erzeugen des Links noch
   * keinen Fall. Der Upload-Link verlangt ihn weiterhin – sein Auflöser
   * vergleicht gegen `link.caseId` und weist ein Token ohne Fall damit ab.
   */
  caseId?: string;
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
 * Kurzes, undurchsichtiges Token fuer Kundenlinks – 22 Zeichen statt der rund
 * 170 des signierten Formats.
 *
 * Warum das reicht: Der signierte Token trug seine Gueltigkeit selbst mit sich
 * (Fall, Link, Ablauf, Signatur) und war deshalb so lang. Gebraucht wird das
 * nie – zu jedem Link existiert ohnehin eine Zeile in der Datenbank, und
 * genau sie entscheidet ueber Ablauf, Kontingent und Widerruf. Der Aufloeser
 * findet sie ueber den HMAC-Hash des Tokens (`hashToken`), also ohne dass ein
 * Klartext-Token gespeichert waere.
 *
 * 16 Byte = 128 Bit Zufall. Ein Link ist damit nicht erratbar; zum Vergleich
 * arbeiten die ueblichen Freigabelinks grosser Anbieter mit 60–130 Bit.
 *
 * Ein zu langer Link ist kein Schoenheitsfehler, sondern ein Zustellproblem:
 * Er bricht in Mailprogrammen um, wird abgeschnitten und sieht nach Phishing
 * aus – genau die Reaktion, die man beim Kunden nicht will.
 */
export function createLinkToken(): string {
  return randomToken(16);
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
