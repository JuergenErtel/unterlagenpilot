"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { DOCUMENT_TYPES, REQUIREMENT_LEVELS, type DocumentType, type RequirementLevel } from "@/lib/domain/enums";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[äöü]/g, (m) => ({ ä: "ae", ö: "oe", ü: "ue" }[m] ?? m))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

/** Legt eine org-spezifische Bankanforderung an. */
export async function addBankRequirement(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const bankName = String(formData.get("bankName") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!bankName || !title) return;

  const docRaw = String(formData.get("documentType") ?? "");
  const documentType = (DOCUMENT_TYPES as readonly string[]).includes(docRaw) ? (docRaw as DocumentType) : null;
  const levelRaw = String(formData.get("level") ?? "bankabhaengig");
  const level: RequirementLevel = (REQUIREMENT_LEVELS as readonly string[]).includes(levelRaw)
    ? (levelRaw as RequirementLevel)
    : "bankabhaengig";

  await prisma.bankRequirement.create({
    data: {
      organizationId: ctx.organizationId,
      bankName,
      key: `org.${slug(bankName)}.${slug(title)}`,
      title,
      documentType,
      level,
    },
  });
  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "organization",
    entityId: ctx.organizationId,
    metadata: { bankRequirementAdded: bankName },
  });
  revalidatePath("/settings/bankanforderungen");
}

/** Entfernt eine org-spezifische Bankanforderung (nur eigene). */
export async function deleteBankRequirement(id: string): Promise<void> {
  const ctx = await requireContext();
  const req = await prisma.bankRequirement.findUnique({ where: { id }, select: { organizationId: true } });
  if (!req || req.organizationId !== ctx.organizationId) return; // statische/fremde nicht löschbar
  await prisma.bankRequirement.delete({ where: { id } });
  revalidatePath("/settings/bankanforderungen");
}
