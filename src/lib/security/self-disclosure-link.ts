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

/**
 * Gemeinsamer Kern für beide Link-Arten: Zeile zuerst anlegen, damit die
 * linkId ins signierte Token wandern kann, danach den echten Hash nachtragen.
 */
async function linkAnlegen(
  ziel: { caseId: string } | { formularId: string },
  expiresAt: Date
): Promise<{ linkId: string; token: string }> {
  const link = await prisma.selfDisclosureLink.create({
    data: { ...ziel, tokenHash: `pending-${crypto.randomUUID()}`, expiresAt, active: true },
  });
  const token = createUploadToken({
    ...("caseId" in ziel ? { caseId: ziel.caseId } : {}),
    linkId: link.id,
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  await prisma.selfDisclosureLink.update({
    where: { id: link.id },
    data: { tokenHash: hashToken(token) },
  });
  return { linkId: link.id, token };
}

export async function createSelfDisclosureLink(
  caseId: string,
  expiresAt: Date,
  options: { organizationId: string; actorUserId?: string | null }
): Promise<CreatedSelfDisclosureLink> {
  const { linkId, token } = await linkAnlegen({ caseId }, expiresAt);
  await audit({
    organizationId: options.organizationId,
    userId: options.actorUserId ?? null,
    action: "upload_link.created",
    entityType: "case",
    entityId: caseId,
    metadata: { linkId, zweck: "selbstauskunft", expiresAt: expiresAt.toISOString() },
  });
  return { linkId, token, url: buildSelfDisclosureUrl(token), expiresAt };
}

/**
 * Link eines Anfrageformulars – ohne Fall. Er entsteht in dem Moment, in dem
 * ein Besucher den ersten Schritt absendet, und gehoert damit genau ihm.
 */
export async function createAnfrageLink(
  formularId: string,
  expiresAt: Date,
  options: { organizationId: string }
): Promise<CreatedSelfDisclosureLink> {
  const { linkId, token } = await linkAnlegen({ formularId }, expiresAt);
  await audit({
    organizationId: options.organizationId,
    userId: null,
    action: "upload_link.created",
    entityType: "leadformular",
    entityId: formularId,
    metadata: { linkId, zweck: "anfrage", expiresAt: expiresAt.toISOString() },
  });
  return { linkId, token, url: buildSelfDisclosureUrl(token), expiresAt };
}

export interface SelfDisclosureAccess {
  linkId: string;
  /** null, solange der Bogen aus einem Anfrageformular stammt. */
  caseId: string | null;
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
      formularId: true,
      formular: { select: { organizationId: true } },
    },
  });
  if (!link || !link.active) return null;
  if (link.expiresAt < new Date()) return null;
  // Beide Seiten auf null normalisieren: Beim Formular-Link ist link.caseId
  // null und payload.caseId undefined – ein roher !==-Vergleich wuerde jeden
  // Formular-Bogen aussperren.
  if ((link.caseId ?? null) !== (payload.caseId ?? null)) return null;
  if (link.tokenHash !== hashToken(token)) return null;

  const organizationId = link.case?.organizationId ?? link.formular?.organizationId ?? null;
  // Weder Fall noch Formular: verwaister Link, kein Zugang.
  if (!organizationId) return null;

  return { linkId: link.id, caseId: link.caseId, organizationId };
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
  // Formular-Links haengen hier nicht: kein Fall, kein Widerruf ueber diesen
  // Weg. Fremde Organisationen bekommen dieselbe Antwort wie "nicht gefunden".
  if (!link?.caseId || link.case?.organizationId !== ctx.organizationId) return;
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
