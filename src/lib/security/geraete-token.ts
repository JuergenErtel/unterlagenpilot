import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { randomToken } from "@/lib/security/upload-token";
import type { AppContext } from "@/lib/auth/context";
import type { BackofficeRolle, UserRole } from "@/lib/domain/enums";

/**
 * Persoenliche Geraetetoken fuer den Apple-Kurzbefehl "An BaufiDesk teilen".
 *
 * Das Token ist ein zweiter Weg in dieselben Akten, nicht in mehr: Es haengt an
 * genau einem Nutzer, und die Routen entscheiden mit dessen Kontext ueber jeden
 * Zugriff (entscheideAktenzugriff) – dieselbe Regel wie im Browser. Damit gilt
 * hier automatisch, was fuer jeden globalen Drittzugang gilt: gebunden an EINE
 * Organisation, nie an alle.
 *
 * Gespeichert wird nur der HMAC-Hash. Ein Datenbankleck liefert also kein
 * benutzbares Token, und das Klartext-Token existiert nur auf dem Geraet.
 */

/** Praefix, damit ein Fund in Logs oder Zwischenablage sofort zuzuordnen ist. */
const PRAEFIX = "bd_";

/**
 * Hash des Klartext-Tokens fuer die Speicherung.
 *
 * Die Marke `geraet:` trennt den Namensraum von den Kunden-Upload-Links
 * (`uplink:` in upload-token.ts). Beide Tokenarten liegen gehasht in derselben
 * Datenbank und teilen sich das Geheimnis; ohne eigene Marke koennte ein
 * Kunden-Upload-Token als Geraetetoken durchgehen und damit die Fallliste des
 * Vermittlers oeffnen. Der Test haelt das fest.
 */
export function hashGeraeteToken(token: string): string {
  const secret = getEnv().UPLOAD_TOKEN_SECRET;
  return crypto.createHmac("sha256", secret).update(`geraet:${token}`).digest("base64url");
}

export interface GeraeteTokenKontext {
  tokenId: string;
  bezeichnung: string;
  ctx: AppContext;
}

export interface CreatedGeraeteToken {
  id: string;
  /** Klartext-Token – nur hier verfuegbar, niemals erneut abrufbar. */
  token: string;
}

export async function createGeraeteToken(opts: {
  userId: string;
  organizationId: string;
  bezeichnung: string;
}): Promise<CreatedGeraeteToken> {
  // 24 Byte = 192 Bit Zufall. Das Token wird einmal in den Kurzbefehl kopiert
  // und danach nie wieder getippt – Kuerze bringt hier nichts, anders als beim
  // Kundenlink, der in einer Mail stehen muss.
  const token = `${PRAEFIX}${randomToken(24)}`;
  const zeile = await prisma.geraeteToken.create({
    data: {
      userId: opts.userId,
      tokenHash: hashGeraeteToken(token),
      bezeichnung: opts.bezeichnung.trim() || "Gerät",
      active: true,
    },
  });

  await audit({
    organizationId: opts.organizationId,
    userId: opts.userId,
    action: "geraete_token.created",
    entityType: "user",
    entityId: opts.userId,
    metadata: { tokenId: zeile.id, bezeichnung: opts.bezeichnung },
  });

  return { id: zeile.id, token };
}

/**
 * Prueft ein Geraetetoken und baut daraus den Kontext seines Besitzers.
 *
 * Rolle, Organisation und Aktiv-Kennzeichen kommen – wie bei der Session – aus
 * der DATENBANK, nicht aus dem Token: Ein gesperrter oder herabgestufter Nutzer
 * behielte sonst seine Rechte, solange das Geraet das Token hat.
 */
export async function resolveGeraeteToken(token: string): Promise<GeraeteTokenKontext | null> {
  const roh = token.trim();
  if (!roh) return null;

  const zeile = await prisma.geraeteToken.findUnique({
    where: { tokenHash: hashGeraeteToken(roh) },
    select: {
      id: true,
      bezeichnung: true,
      active: true,
      user: {
        select: {
          id: true,
          name: true,
          active: true,
          role: true,
          platformAdmin: true,
          backofficeRolle: true,
          organizationId: true,
          organization: { select: { name: true } },
        },
      },
    },
  });
  if (!zeile?.active || !zeile.user?.active || !zeile.user.organization) return null;

  // Letzte Nutzung nachtragen. Das ist die einzige Handhabe, ein vergessenes
  // Geraet zu erkennen – aber kein Grund, den Upload scheitern zu lassen.
  await prisma.geraeteToken
    .update({ where: { id: zeile.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    tokenId: zeile.id,
    bezeichnung: zeile.bezeichnung,
    ctx: {
      organizationId: zeile.user.organizationId,
      organizationName: zeile.user.organization.name,
      userId: zeile.user.id,
      userName: zeile.user.name,
      role: zeile.user.role as UserRole,
      // Ein Geraetetoken ist kein Login: Plattformrechte (Freigabe von
      // Registrierungsantraegen) gibt es ueber diesen Weg grundsaetzlich nicht.
      platformAdmin: false,
      backofficeRolle: (zeile.user.backofficeRolle as BackofficeRolle | null) ?? null,
      isDemo: false,
    },
  };
}

export interface GeraeteTokenView {
  id: string;
  bezeichnung: string;
  active: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export async function listGeraeteTokens(userId: string): Promise<GeraeteTokenView[]> {
  return prisma.geraeteToken.findMany({
    where: { userId, active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, bezeichnung: true, active: true, lastUsedAt: true, createdAt: true },
  });
}

/**
 * Widerruft ein Token sofort. `updateMany` mit userId im Filter statt
 * "erst laden, dann pruefen": Ein fremdes Token trifft dann schlicht keine
 * Zeile, statt dass eine vergessene Pruefung es erwischt.
 */
export async function revokeGeraeteToken(
  id: string,
  ctx: { userId: string; organizationId: string }
): Promise<void> {
  const { count } = await prisma.geraeteToken.updateMany({
    where: { id, userId: ctx.userId, active: true },
    data: { active: false },
  });
  if (count === 0) return;
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "geraete_token.revoked",
    entityType: "user",
    entityId: ctx.userId,
    metadata: { tokenId: id },
  });
}
