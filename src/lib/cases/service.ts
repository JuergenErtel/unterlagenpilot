import { prisma } from "@/lib/db";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import {
  buildChecklistForCase,
  type ExistingDocument,
  type ResolvedChecklistItem,
} from "@/lib/checklists/engine";
import { computeReadiness, type ReadinessResult } from "@/lib/documents/readiness";
import { bankRequirementItems, resolveBankRequirements } from "@/lib/rules/bank-requirements";
import { AIService } from "@/lib/ai/service";
import type { CanonicalCase } from "@/lib/domain/canonical";
import type {
  DocumentType,
  PropertyType,
  UsageType,
} from "@/lib/domain/enums";
import type { ExtractedField, PlausibilityCheck } from "@/lib/domain/ai-schemas";

const ai = new AIService();

export interface CaseAggregate {
  caseId: string;
  caseNumber: string;
  canonical: CanonicalCase;
  checklist: ResolvedChecklistItem[];
  plausibility: PlausibilityCheck[];
  missing: ResolvedChecklistItem[];
  readiness: ReadinessResult;
  documentCount: number;
}

/** Vollständige, live berechnete Sicht auf einen Fall. */
export async function getCaseAggregate(caseId: string): Promise<CaseAggregate> {
  const [caseRow, documents] = await Promise.all([
    prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      include: { applicants: true, property: true },
    }),
    prisma.document.findMany({
      where: { caseId },
      include: { extractedFields: true },
    }),
  ]);

  // Bankindividuelle Anforderungen (statischer Katalog + org-spezifische DB-Pflege)
  // als zusätzliche Checklisten-Positionen auflösen.
  const dbBankReqs = caseRow.bankName
    ? await prisma.bankRequirement.findMany({
        where: {
          bankName: caseRow.bankName,
          OR: [{ organizationId: caseRow.organizationId }, { organizationId: null }],
        },
        select: { key: true, title: true, documentType: true, level: true },
      })
    : [];
  const extraItems = bankRequirementItems(
    resolveBankRequirements(caseRow.bankName, dbBankReqs.map((r) => ({
      key: r.key,
      title: r.title,
      documentType: r.documentType,
      level: r.level,
    })))
  );

  const canonical = await caseToCanonical(caseId);

  const existing: ExistingDocument[] = documents.map((d) => ({
    documentType: d.documentType,
    reviewStatus: d.reviewStatus,
    readable: d.readable,
    ageDays: ageFromPeriod(d.period),
    applicantId: d.applicantId,
  }));

  const checklist = buildChecklistForCase(
    {
      financingType: caseRow.financingType ?? undefined,
      employmentType: caseRow.primaryEmploymentType ?? undefined,
      propertyType: (caseRow.property?.objektart as PropertyType) ?? undefined,
      usage: (caseRow.property?.nutzung as UsageType) ?? undefined,
      kapitalanlage: caseRow.kapitalanlage,
      applicantCount: caseRow.applicants.length,
      applicantIds: caseRow.applicants
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((a) => a.id),
    },
    existing,
    extraItems
  );

  const docFields = documents.map((d) => ({
    documentType: d.documentType as DocumentType | null,
    fields: d.extractedFields.map<ExtractedField>((f) => ({
      key: f.key,
      label: f.label,
      value: f.correctedValue ?? f.value,
      confidence: f.confidence,
      source: f.source ?? undefined,
    })),
  }));

  const plausibility = ai.analyzePlausibility({ caseData: canonical, documents: docFields }).checks;
  const readiness = computeReadiness({ checklist, plausibility });
  const missing = checklist.filter(
    (i) => i.status === "offen" || i.status === "unvollstaendig" || i.status === "nicht_aktuell"
  );

  return {
    caseId,
    caseNumber: caseRow.caseNumber,
    canonical,
    checklist,
    plausibility,
    missing,
    readiness,
    documentCount: documents.length,
  };
}

function ageFromPeriod(period: string | null): number | null {
  if (!period) return null;
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return Math.round((Date.now() - d.getTime()) / 86_400_000);
}

export interface DashboardBuckets {
  offen: number;
  neueUploads: number;
  pruefbereit: number;
  unterlagenFehlen: number;
  bankNachforderung: number;
  bereitEuropace: number;
  bereitFinlink: number;
  bereitEhyp: number;
  exportprobleme: number;
}

export async function getDashboardBuckets(
  organizationId: string
): Promise<DashboardBuckets> {
  const [
    offen,
    neueUploads,
    pruefbereit,
    unterlagenFehlen,
    bankNachforderung,
    releasedMappings,
    exportprobleme,
  ] = await Promise.all([
    prisma.case.count({
      where: { organizationId, status: { notIn: ["abgeschlossen", "archiviert"] } },
    }),
    prisma.document.count({
      where: { case: { organizationId }, reviewStatus: "offen", ocrStatus: "fertig" },
    }),
    prisma.case.count({
      where: { organizationId, status: "vermittlerpruefung_erforderlich" },
    }),
    prisma.case.count({ where: { organizationId, status: "unterlagen_fehlen" } }),
    prisma.missingDocumentRequest.count({
      where: { case: { organizationId }, bank: { not: null }, resolved: false },
    }),
    prisma.platformMapping.findMany({
      where: { case: { organizationId }, released: true },
      select: { platform: true },
    }),
    prisma.exportJob.count({ where: { case: { organizationId }, status: "failed" } }),
  ]);

  return {
    offen,
    neueUploads,
    pruefbereit,
    unterlagenFehlen,
    bankNachforderung,
    bereitEuropace: releasedMappings.filter((m) => m.platform === "europace").length,
    bereitFinlink: releasedMappings.filter((m) => m.platform === "finlink").length,
    bereitEhyp: releasedMappings.filter((m) => m.platform === "ehyp_home").length,
    exportprobleme,
  };
}
