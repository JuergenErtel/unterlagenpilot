import { prisma } from "@/lib/db";
import { hashToken, randomToken } from "@/lib/security/upload-token";
import type { AuthTokenZweck } from "@/lib/domain/enums";

/**
 * Magic-Link-Token fuer Zugangszwecke (Bestaetigung, Passwort-Reset, Einladung).
 *
 * Alle drei Zwecke teilen sich eine Tabelle – die Trennung steckt im Feld
 * `zweck`. Damit sie so verlaesslich ist wie eine eigene Tabelle, gibt es genau
 * EINE Einloesefunktion, die den Zweck immer mitfiltert. Es darf keinen zweiten
 * Weg geben, ein AuthToken einzuloesen.
 *
 * Das Klartext-Token existiert nur im Rueckgabewert von `erstelleToken` –
 * gespeichert wird ausschliesslich sein Hash.
 */
export const TOKEN_GUELTIGKEIT: Record<AuthTokenZweck, number> = {
  email_bestaetigung: 48 * 3600,
  passwort_reset: 3600,
  einladung: 7 * 24 * 3600,
};

export interface ErstellterToken {
  id: string;
  /** Klartext – nur hier verfuegbar, niemals erneut abrufbar. */
  token: string;
  expiresAt: Date;
}

export async function erstelleToken(input: {
  zweck: AuthTokenZweck;
  userId?: string;
  signupRequestId?: string;
  gueltigSekunden: number;
}): Promise<ErstellterToken> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + input.gueltigSekunden * 1000);
  const row = await prisma.authToken.create({
    data: {
      tokenHash: hashToken(token),
      zweck: input.zweck,
      userId: input.userId ?? null,
      signupRequestId: input.signupRequestId ?? null,
      expiresAt,
    },
  });
  return { id: row.id, token, expiresAt };
}

export interface TokenTreffer {
  id: string;
  userId: string | null;
  signupRequestId: string | null;
}

/**
 * Prueft Zweck, Ablauf und Einmaligkeit und markiert das Token als verbraucht.
 * Null heisst immer dasselbe: kein Zugang. Der Aufrufer erfaehrt bewusst nicht,
 * woran es lag.
 */
export async function verbraucheToken(
  token: string,
  zweck: AuthTokenZweck
): Promise<TokenTreffer | null> {
  if (!token) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) return null;
  // Zweckbindung: ein Einladungslink darf niemals als Passwort-Reset gelten.
  if (row.zweck !== zweck) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  // Bedingtes Update: parallele Einloesungen desselben Links duerfen nicht
  // beide durchgehen (TOCTOU) – nur wer die Zeile tatsaechlich umschreibt, gewinnt.
  const { count } = await prisma.authToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count !== 1) return null;

  return { id: row.id, userId: row.userId, signupRequestId: row.signupRequestId };
}

/**
 * Schlaegt ein Token NUR nach – ohne es zu verbrauchen.
 *
 * Fuer Seiten, die beim Aufruf lediglich entscheiden muessen, ob der Link noch
 * gilt: Link-Scanner in Firmen-Mailservern (Outlook Safe Links, Proofpoint)
 * rufen jede URL aus einer Mail einmal ab. Wuerde die Seite das Token beim
 * Rendern verbrauchen, waere es entwertet, bevor ein Mensch klickt.
 *
 * Das ist KEIN zweiter Einloeseweg: `usedAt` bleibt unangetastet, und die
 * eigentliche Wirkung tritt weiterhin nur ueber `verbraucheToken` ein.
 */
export async function findeToken(
  token: string,
  zweck: AuthTokenZweck
): Promise<TokenTreffer | null> {
  if (!token) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) return null;
  if (row.zweck !== zweck) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { id: row.id, userId: row.userId, signupRequestId: row.signupRequestId };
}

/** Entwertet alle offenen Token eines Zwecks (z. B. nach erfolgreichem Reset). */
export async function entwerteOffeneToken(
  zweck: AuthTokenZweck,
  ziel: { userId?: string; signupRequestId?: string }
): Promise<void> {
  await prisma.authToken.updateMany({
    where: {
      zweck,
      usedAt: null,
      ...(ziel.userId ? { userId: ziel.userId } : {}),
      ...(ziel.signupRequestId ? { signupRequestId: ziel.signupRequestId } : {}),
    },
    data: { usedAt: new Date() },
  });
}
