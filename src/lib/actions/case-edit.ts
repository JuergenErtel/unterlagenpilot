"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { MARITAL_STATUSES, type MaritalStatus } from "@/lib/domain/enums";

/** Liest einen Trim-Wert aus FormData; gibt undefined zurück, wenn leer. */
function field(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Aktualisiert die Pflicht-/Grunddaten eines Antragstellers.
 * Robust gegen leere Felder: nur gesetzte Werte werden geschrieben.
 */
export async function editApplicant(
  applicantId: string,
  formData: FormData
): Promise<void> {
  const ctx = await requireContext();

  // Tenant-Isolation: Antragsteller muss zu einem Fall der eigenen Organisation gehören.
  const owner = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { caseId: true, case: { select: { organizationId: true } } },
  });
  if (!owner || owner.case.organizationId !== ctx.organizationId) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  const vorname = field(formData, "vorname");
  const nachname = field(formData, "nachname");
  const geburtsdatumRaw = field(formData, "geburtsdatum");
  const familienstandRaw = field(formData, "familienstand");
  const email = field(formData, "email");
  const telefon = field(formData, "telefon");

  const familienstand =
    familienstandRaw && (MARITAL_STATUSES as readonly string[]).includes(familienstandRaw)
      ? (familienstandRaw as MaritalStatus)
      : undefined;

  const geburtsdatumParsed = geburtsdatumRaw ? new Date(geburtsdatumRaw) : undefined;
  // Ungültige Datumseingaben ignorieren statt mit Prisma-Fehler (500) zu antworten.
  const geburtsdatum =
    geburtsdatumParsed && !Number.isNaN(geburtsdatumParsed.getTime()) ? geburtsdatumParsed : undefined;

  const data: {
    vorname?: string;
    nachname?: string;
    geburtsdatum?: Date;
    familienstand?: MaritalStatus;
    email?: string;
    phone?: string;
  } = {};
  if (vorname !== undefined) data.vorname = vorname;
  if (nachname !== undefined) data.nachname = nachname;
  if (geburtsdatum !== undefined) data.geburtsdatum = geburtsdatum;
  if (familienstand !== undefined) data.familienstand = familienstand;
  if (email !== undefined) data.email = email;
  if (telefon !== undefined) data.phone = telefon;

  const updated = await prisma.applicant.update({
    where: { id: applicantId },
    data,
    select: { caseId: true },
  });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "applicant",
    entityId: applicantId,
    metadata: { fields: "basics" },
  });

  revalidatePath(`/cases/${updated.caseId}`);
  revalidatePath(`/cases/${updated.caseId}/edit`);
}
