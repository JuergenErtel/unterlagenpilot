"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext, requireCaseAccess } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { MARITAL_STATUSES, MAX_APPLICANTS, type MaritalStatus } from "@/lib/domain/enums";

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

/**
 * Fügt einen weiteren Antragsteller hinzu (max. 2). No-op, wenn das Limit
 * bereits erreicht ist – die UI zeigt den Button dann ohnehin nicht.
 */
export async function addApplicant(caseId: string): Promise<void> {
  const { ctx } = await requireCaseAccess(caseId);

  const current = await prisma.applicant.count({ where: { caseId } });
  if (current >= MAX_APPLICANTS) return;

  const highest = await prisma.applicant.findFirst({
    where: { caseId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (highest?.position ?? 0) + 1;

  await prisma.applicant.create({ data: { caseId, position } });

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    metadata: { applicantAdded: position },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/cases/${caseId}/edit`);
}

/**
 * Entfernt einen Antragsteller (nie den letzten) und nummeriert die
 * verbleibenden lückenlos neu. Zugeordnete Dokumente werden dabei nicht
 * gelöscht (Relation ist onDelete: SetNull).
 */
export async function removeApplicant(applicantId: string): Promise<void> {
  const ctx = await requireContext();

  const owner = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { caseId: true, position: true, case: { select: { organizationId: true } } },
  });
  if (!owner || owner.case.organizationId !== ctx.organizationId) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  const total = await prisma.applicant.count({ where: { caseId: owner!.caseId } });
  if (total <= 1) return; // den letzten Antragsteller nicht entfernen

  await prisma.applicant.delete({ where: { id: applicantId } });

  // Verbleibende lückenlos neu nummerieren (1..n), damit "Antragsteller 1/2" stimmt.
  const remaining = await prisma.applicant.findMany({
    where: { caseId: owner!.caseId },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  for (let i = 0; i < remaining.length; i++) {
    const target = i + 1;
    if (remaining[i]!.position !== target) {
      await prisma.applicant.update({ where: { id: remaining[i]!.id }, data: { position: target } });
    }
  }

  await audit({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "case.updated",
    entityType: "case",
    entityId: owner!.caseId,
    metadata: { applicantRemoved: applicantId },
  });

  revalidatePath(`/cases/${owner!.caseId}`);
  revalidatePath(`/cases/${owner!.caseId}/edit`);
}
