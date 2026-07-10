import { prisma } from "@/lib/db";
import type { CanonicalCase } from "@/lib/domain/canonical";
import { formatCaseNumber, highestSequence, caseNumberPrefix } from "@/lib/cases/case-number";

export interface WriteContext {
  organizationId: string;
  userId: string;
}

export interface WriteResult {
  caseId: string;
  caseNumber: string;
  deduped: boolean;
}

/** true bei Prisma-Unique-Constraint-Verletzung (P2002). */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

async function nextCaseNumber(organizationId: string, year: number): Promise<string> {
  const rows = await prisma.case.findMany({
    where: { organizationId, caseNumber: { startsWith: caseNumberPrefix(year) } },
    select: { caseNumber: true },
  });
  return formatCaseNumber(year, highestSequence(rows.map((r) => r.caseNumber)) + 1);
}

/**
 * Legt aus einem kanonischen Fall einen neuen BaufiDesk-Fall an
 * (Case + Applicants + Employment/Income + Property + FinancingRequest) in einer
 * Transaktion. Existiert bereits ein Fall mit (organizationId, finlinkId), wird
 * dieser zurückgegeben statt eine Dublette anzulegen.
 */
export async function createCaseFromCanonical(
  ctx: WriteContext,
  canonical: CanonicalCase
): Promise<WriteResult> {
  const finlinkId = canonical.platformIds.finlinkId ?? null;

  // Dedup: gleicher externer Vorgang in derselben Organisation.
  if (finlinkId) {
    const existing = await prisma.case.findFirst({
      where: { organizationId: ctx.organizationId, finlinkId },
      select: { id: true, caseNumber: true },
    });
    if (existing) return { caseId: existing.id, caseNumber: existing.caseNumber, deduped: true };
  }

  const year = new Date().getFullYear();

  const applicantsCreate = canonical.applicants.map((a) => {
    const emp = canonical.employment.filter((e) => e.applicantPosition === a.position);
    const inc = canonical.income.filter((i) => i.applicantPosition === a.position);
    return {
      position: a.position,
      vorname: a.vorname ?? null,
      nachname: a.nachname ?? null,
      geburtsdatum: a.geburtsdatum ? new Date(a.geburtsdatum) : null,
      geburtsort: a.geburtsort ?? null,
      staatsangehoerigkeit: a.staatsangehoerigkeit ?? null,
      familienstand: a.familienstand ?? null,
      anzahlKinder: a.anzahlKinder ?? null,
      street: a.strasse ?? null,
      zip: a.plz ?? null,
      city: a.ort ?? null,
      email: a.email ?? null,
      phone: a.telefon ?? null,
      employment: {
        create: emp.map((e) => ({
          beschaeftigungsart: e.beschaeftigungsart ?? null,
          beruf: e.beruf ?? null,
          arbeitgeber: e.arbeitgeber ?? null,
        })),
      },
      income: {
        create: inc.map((i) => ({
          nettoMonatlich: i.nettoMonatlich ?? null,
          bruttoMonatlich: i.bruttoMonatlich ?? null,
        })),
      },
    };
  });

  const p = canonical.property;
  const f = canonical.financing;

  const buildData = (caseNumber: string) => ({
    organizationId: ctx.organizationId,
    brokerId: ctx.userId,
    caseNumber,
    status: "neu" as const,
    financingType: canonical.financingType ?? null,
    finlinkId,
    applicants: { create: applicantsCreate },
    property: p
      ? { create: { objektart: p.objektart ?? null, street: p.strasse ?? null, zip: p.plz ?? null, city: p.ort ?? null } }
      : undefined,
    financingRequest: {
      create: { kaufpreis: f.kaufpreis ?? null, darlehenswunsch: f.darlehenswunsch ?? null },
    },
    sources: { create: { type: "finlink_import" as const, externalId: finlinkId } },
  });

  // Race-Schutz auf @@unique([organizationId, caseNumber]): bei P2002 neu berechnen.
  let created: { id: string; caseNumber: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const caseNumber = await nextCaseNumber(ctx.organizationId, year);
    try {
      created = await prisma.case.create({ data: buildData(caseNumber), select: { id: true, caseNumber: true } });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 4) continue;
      throw e;
    }
  }
  return { caseId: created!.id, caseNumber: created!.caseNumber, deduped: false };
}
