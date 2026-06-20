import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuditAction } from "@/lib/domain/enums";

/**
 * Audit-Logging für Zugriffe, Änderungen, KI-Auswertungen, Exporte, Freigaben.
 * Es werden nur Metadaten/Diff-Keys gespeichert – KEINE sensiblen Klartexte.
 */
export async function audit(params: {
  organizationId: string;
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata: (sanitize(params.metadata) ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      ipAddress: params.ipAddress ?? null,
    },
  });
}

/** Entfernt offensichtlich sensible Felder, behält nur Schlüssel/Flags. */
function sanitize(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const SENSITIVE = ["iban", "ausweisnummer", "steuerId", "passwordHash", "ocrText", "body"];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE.includes(k)) out[k] = "[redacted]";
    else if (typeof v === "string" && v.length > 120) out[k] = `${v.slice(0, 40)}…`;
    else out[k] = v;
  }
  return out;
}
