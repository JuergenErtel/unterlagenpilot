import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { createUploadToken, verifyUploadToken, hashToken } from "@/lib/security/upload-token";

/**
 * Magic Link für die Selbstauskunft – bewusst ein eigener Datensatz neben dem
 * Upload-Link. Beide Token haben dasselbe Format; getrennt sind sie durch die
 * Tabelle, in der ihre linkId liegt. Ein Upload-Token findet hier keinen
 * Datensatz und ist damit wirkungslos, und umgekehrt.
 *
 * Das Klartext-Token gibt es nur einmal bei der Erstellung; gespeichert wird
 * ausschließlich der Hash.
 */
export interface CreatedSelfDisclosureLink {
  linkId: string;
  /** Klartext – nur hier verfügbar, niemals erneut abrufbar. */
  token: string;
  url: string;
  expiresAt: Date;
}

export function buildSelfDisclosureUrl(token: string): string {
  return `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/selbstauskunft/${token}`;
}

export async function createSelfDisclosureLink(
  caseId: string,
  expiresAt: Date,
  options: { organizationId: string; actorUserId?: string | null }
): Promise<CreatedSelfDisclosureLink> {
  // Zeile zuerst anlegen, damit die linkId ins signierte Token wandern kann.
  const link = await prisma.selfDisclosureLink.create({
    data: { caseId, tokenHash: `pending-${crypto.randomUUID()}`, expiresAt, active: true },
  });

  const token = createUploadToken({
    caseId,
    linkId: link.id,
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  await prisma.selfDisclosureLink.update({
    where: { id: link.id },
    data: { tokenHash: hashToken(token) },
  });

  await audit({
    organizationId: options.organizationId,
    userId: options.actorUserId ?? null,
    action: "upload_link.created",
    entityType: "case",
    entityId: caseId,
    metadata: { linkId: link.id, zweck: "selbstauskunft", expiresAt: expiresAt.toISOString() },
  });

  return { linkId: link.id, token, url: buildSelfDisclosureUrl(token), expiresAt };
}

export interface SelfDisclosureAccess {
  linkId: string;
  caseId: string;
  organizationId: string;
}

/** Prüft Signatur, Gültigkeit, Widerruf und Hash. Null heißt: kein Zugang. */
export async function resolveSelfDisclosureToken(
  token: string
): Promise<SelfDisclosureAccess | null> {
  const payload = verifyUploadToken(token);
  if (!payload) return null;
  const link = await prisma.selfDisclosureLink.findUnique({
    where: { id: payload.linkId },
    select: {
      id: true,
      tokenHash: true,
      active: true,
      expiresAt: true,
      caseId: true,
      case: { select: { organizationId: true } },
    },
  });
  if (!link || !link.active) return null;
  if (link.expiresAt < new Date()) return null;
  if (link.caseId !== payload.caseId) return null;
  if (link.tokenHash !== hashToken(token)) return null;
  return { linkId: link.id, caseId: link.caseId, organizationId: link.case.organizationId };
}

/** Widerruft einen Link sofort. Fremde Organisationen bekommen kein Signal. */
export async function deactivateSelfDisclosureLink(
  linkId: string,
  ctx: { organizationId: string; userId?: string | null }
): Promise<void> {
  const link = await prisma.selfDisclosureLink.findUnique({
    where: { id: linkId },
    select: { id: true, caseId: true, case: { select: { organizationId: true } } },
  });
  if (!link || link.case.organizationId !== ctx.organizationId) return;
  await prisma.selfDisclosureLink.update({ where: { id: linkId }, data: { active: false } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId ?? null,
    action: "upload_link.deactivated",
    entityType: "case",
    entityId: link.caseId,
    metadata: { linkId, zweck: "selbstauskunft" },
  });
}
