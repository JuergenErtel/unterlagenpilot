import { prisma } from "@/lib/db";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import {
  buildChecklistForCase,
  type ExistingDocument,
  type ResolvedChecklistItem,
} from "@/lib/checklists/engine";
import { checklistEingabeFuerFall } from "@/lib/checklists/case-input";
import { computeReadiness, type ReadinessResult } from "@/lib/documents/readiness";
import { bankRequirementItems, resolveBankRequirements } from "@/lib/rules/bank-requirements";
import { AIService } from "@/lib/ai/service";
import type { CanonicalCase } from "@/lib/domain/canonical";
import type { DocumentType } from "@/lib/domain/enums";
import type { ExtractedField, PlausibilityCheck } from "@/lib/domain/ai-schemas";
import { ladeAktivenAbruf } from "@/lib/anforderungen/speicher";
import { anforderungsPositionen } from "@/lib/anforderungen/positionen";
import { gleicheAb, zaehle, type AbgleichZahlen } from "@/lib/anforderungen/abgleich";

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
  /** Nur gesetzt, wenn fuer diesen Fall schon Anforderungen geholt wurden. */
  anforderungsAbgleich: {
    bankName: string;
    abgerufenAm: Date;
    quelle: string;
    zahlen: AbgleichZahlen;
  } | null;
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

  // Vierte Quelle: was die Bank laut Europace tatsaechlich verlangt. Die
  // einzige verbindliche Quelle – die anderen drei raten.
  const aktiverAbruf = await ladeAktivenAbruf(caseId);

  const canonical = await caseToCanonical(caseId);

  const existing: ExistingDocument[] = documents.map((d) => ({
    documentType: d.documentType,
    reviewStatus: d.reviewStatus,
    readable: d.readable,
    ageDays: ageFromPeriod(d.period),
    applicantId: d.applicantId,
  }));

  // Der Abgleich MUSS gegen eine Basis-Checkliste ohne die Europace-Positionen
  // laufen. Baut man die Checkliste zuerst inklusive dieser Positionen und
  // gleicht dann ab, hat jede Anforderung, die ueberhaupt "neu" sein koennte,
  // durch anforderungsPositionen() bereits eine eigene Zeile mit demselben
  // Dokumenttyp (oder Namen) bekommen – gleicheAb findet dann IMMER ein
  // Gegenstueck. "neu" waere strukturell immer 0: die Anforderungen wuerden
  // gegen sich selbst verglichen. Der Basis-Checkliste-Umweg ist der einzige
  // Weg zu einer ehrlichen Zahl.
  const checklistEingabe = checklistEingabeFuerFall(caseRow);
  const basisCheckliste = buildChecklistForCase(checklistEingabe, existing, extraItems);

  const befunde = aktiverAbruf ? gleicheAb(aktiverAbruf.anforderungen, basisCheckliste) : [];

  // Nur fuer "neu"-Befunde entstehen Positionen. Was sich laut Schritt oben
  // schon deckt, erzeugt keine zweite Zeile mit demselben Dokumenttyp
  // (Design: "Positionen mit Gegenstueck erzeugen keine neue Zeile — das ist
  // der Kern: keine Dubletten"). Sichtbare Markierung dieser Positionen in der
  // Checkliste ist noch offen.
  const neuIds = new Set(
    befunde.filter((b): b is Extract<typeof b, { art: "neu" }> => b.art === "neu").map((b) => b.anforderungId)
  );
  const neuePositionen = aktiverAbruf
    ? anforderungsPositionen({
        ...aktiverAbruf,
        anforderungen: aktiverAbruf.anforderungen.filter((a) => neuIds.has(a.id)),
      })
    : [];

  const alleExtras = [...extraItems, ...neuePositionen];

  const checklist = buildChecklistForCase(checklistEingabe, existing, alleExtras);

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

  // Zahlen aus dem Abgleich gegen die BASIS-Checkliste (oben), nicht aus einem
  // zweiten Abgleich gegen die fertige Checkliste – die enthaelt inzwischen
  // die neuen Positionen selbst und wuerde wieder auf die zirkulaere Zahl
  // hinauslaufen, die dieser Umbau beheben soll.
  const anforderungsAbgleich: CaseAggregate["anforderungsAbgleich"] = aktiverAbruf
    ? {
        bankName: aktiverAbruf.bankName,
        abgerufenAm: aktiverAbruf.abgerufenAm,
        quelle: aktiverAbruf.quelle,
        zahlen: zaehle(befunde),
      }
    : null;

  return {
    caseId,
    caseNumber: caseRow.caseNumber,
    canonical,
    checklist,
    plausibility,
    missing,
    readiness,
    documentCount: documents.length,
    anforderungsAbgleich,
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
