"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { setzeBackofficeFlag } from "@/lib/backoffice/feature";
import type { AktionsErgebnis } from "./backoffice";

/**
 * Plattform-Steuerung des Backoffice: Feature Flag je Organisation und der
 * erste Manager. Nur fuer den Betreiber (User.platformAdmin).
 */
export async function plattformBackofficeFlagAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const admin = await requirePlatformAdmin();
  const organizationId = String(fd.get("organizationId") ?? "");
  const enabled = String(fd.get("enabled") ?? "") === "ja";
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) return { error: "Organisation nicht gefunden." };
  await setzeBackofficeFlag(org.id, enabled);
  await audit({
    organizationId: org.id,
    userId: admin.userId,
    action: "backoffice.flag_geaendert",
    entityType: "organization",
    entityId: org.id,
    metadata: { enabled },
  });
  revalidatePath("/admin/backoffice");
  return { ok: true };
}

export async function plattformManagerAction(_prev: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const admin = await requirePlatformAdmin();
  const organizationId = String(fd.get("organizationId") ?? "");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const u = await prisma.user.findFirst({ where: { email, organizationId, active: true }, select: { id: true } });
  if (!u) return { error: "Kein aktiver Nutzer mit dieser Adresse in der Organisation." };
  await prisma.user.update({ where: { id: u.id }, data: { backofficeRolle: "manager" } });
  await audit({
    organizationId,
    userId: admin.userId,
    action: "backoffice.rolle_geaendert",
    entityType: "user",
    entityId: u.id,
    metadata: { backofficeRolle: "manager", durch: "plattform" },
  });
  revalidatePath("/admin/backoffice");
  return { ok: true };
}
