import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { createUploadToken, hashToken } from "@/lib/security/upload-token";

/**
 * Sichere Kunden-Upload-Links.
 *
 * - Zugriff rein tokenbasiert (kein Login), signiert + gehasht gespeichert.
 * - Ablaufdatum erzwungen, optional ein- oder mehrmalig nutzbar.
 * - Klartext-Token wird nur EINMAL bei Erstellung zurückgegeben (zum Kopieren);
 *   in der DB liegt ausschließlich der Hash.
 */
export interface CreateUploadLinkOptions {
  /** Maximale Anzahl Uploads. null = unbegrenzt. */
  maxUploads?: number | null;
  /** Komfort-Flag: einmalig nutzbar (entspricht maxUploads = 1). */
  singleUse?: boolean;
  /** Für Audit-Zuordnung. */
  actorUserId?: string | null;
  organizationId: string;
}

export interface CreatedUploadLink {
  linkId: string;
  /** Klartext-Token – nur hier verfügbar, niemals erneut abrufbar. */
  token: string;
  url: string;
  expiresAt: Date;
  maxUploads: number | null;
}

export function buildUploadUrl(token: string): string {
  return `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/upload/${token}`;
}

export async function createSecureUploadLink(
  caseId: string,
  expiresAt: Date,
  options: CreateUploadLinkOptions
): Promise<CreatedUploadLink> {
  const maxUploads = options.singleUse ? 1 : options.maxUploads ?? null;

  // 1) Link-Zeile anlegen (Platzhalter-Token, sofort durch Hash ersetzt).
  const link = await prisma.uploadLink.create({
    data: { caseId, token: `pending-${crypto.randomUUID()}`, expiresAt, maxUploads, active: true },
  });

  // 2) Signiertes Token mit linkId binden, Hash speichern.
  const token = createUploadToken({
    caseId,
    linkId: link.id,
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  await prisma.uploadLink.update({ where: { id: link.id }, data: { token: hashToken(token) } });

  await audit({
    organizationId: options.organizationId,
    userId: options.actorUserId ?? null,
    action: "upload_link.created",
    entityType: "case",
    entityId: caseId,
    metadata: { linkId: link.id, maxUploads, expiresAt: expiresAt.toISOString() },
  });

  return { linkId: link.id, token, url: buildUploadUrl(token), expiresAt, maxUploads };
}

/** Deaktiviert einen Link sofort (nicht mehr nutzbar). */
export async function deactivateUploadLink(
  linkId: string,
  ctx: { organizationId: string; userId?: string | null }
): Promise<void> {
  const link = await prisma.uploadLink.findUnique({
    where: { id: linkId },
    select: { id: true, caseId: true, case: { select: { organizationId: true } } },
  });
  if (!link || link.case.organizationId !== ctx.organizationId) return; // kein Leak
  await prisma.uploadLink.update({ where: { id: linkId }, data: { active: false } });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId ?? null,
    action: "upload_link.deactivated",
    entityType: "case",
    entityId: link.caseId,
    metadata: { linkId },
  });
}

/**
 * Erzeugt einen frischen Link und deaktiviert vorherige aktive Links desselben
 * Falls (alte Links damit ungültig).
 */
export async function regenerateUploadLink(
  caseId: string,
  expiresAt: Date,
  options: CreateUploadLinkOptions
): Promise<CreatedUploadLink> {
  await prisma.uploadLink.updateMany({
    where: { caseId, active: true },
    data: { active: false },
  });
  const created = await createSecureUploadLink(caseId, expiresAt, options);
  await audit({
    organizationId: options.organizationId,
    userId: options.actorUserId ?? null,
    action: "upload_link.regenerated",
    entityType: "case",
    entityId: caseId,
    metadata: { linkId: created.linkId },
  });
  return created;
}

export interface UploadLinkView {
  id: string;
  expiresAt: Date;
  active: boolean;
  expired: boolean;
  maxUploads: number | null;
  usedCount: number;
  createdAt: Date;
}

export async function listUploadLinks(
  caseId: string,
  organizationId: string
): Promise<UploadLinkView[]> {
  const links = await prisma.uploadLink.findMany({
    where: { caseId, case: { organizationId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      expiresAt: true,
      active: true,
      maxUploads: true,
      usedCount: true,
      createdAt: true,
    },
  });
  const now = new Date();
  return links.map((l) => ({ ...l, expired: l.expiresAt < now }));
}
