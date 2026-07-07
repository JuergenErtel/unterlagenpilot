import { prisma } from "@/lib/db";
import { getCaseAggregate } from "@/lib/cases/service";
import { AIService } from "@/lib/ai/service";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import { formatEUR } from "@/lib/utils";
import {
  EMPLOYMENT_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  PLATFORM_LABELS,
  type EmploymentType,
  type Platform,
  type PropertyType,
} from "@/lib/domain/enums";
import type {
  BrokerInfo,
  BankSummaryData,
  ChecklistData,
  AuditProtocolData,
  PlatformExportData,
  WohnflaecheData,
} from "@/lib/pdf/renderer";

const ai = new AIService();

export type CasePdfType = "bank-summary" | "checklist" | "audit" | "platform" | "wohnflaeche";

function dateStr(d = new Date()): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export async function getBrokerInfo(organizationId: string): Promise<BrokerInfo> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, street: true, zip: true, city: true, website: true },
  });
  return {
    name: org?.name ?? "BaufiDesk",
    street: org?.street ?? undefined,
    zip: org?.zip ?? undefined,
    city: org?.city ?? undefined,
    website: org?.website ?? undefined,
  };
}

function applicantDisplayNames(applicants: { vorname?: string; nachname?: string }[]): string {
  return applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(", ");
}

/** Erzeugt einen sicheren Dateinamen, z. B. Bankzusammenfassung_Max_Erika_Mustermann.pdf */
export function pdfFileName(
  prefix: string,
  applicants: { vorname?: string | null; nachname?: string | null }[]
): string {
  const vornamen = applicants.map((a) => a.vorname).filter(Boolean) as string[];
  const nachname = [...applicants].reverse().find((a) => a.nachname)?.nachname ?? "";
  const parts = [prefix, ...vornamen, nachname].filter(Boolean).join("_");
  const safe = parts.replace(/[^A-Za-z0-9_äöüÄÖÜß-]+/g, "_");
  return `${safe || prefix}.pdf`;
}

export async function buildBankSummaryData(caseId: string, organizationId: string): Promise<{ data: BankSummaryData; fileName: string }> {
  const agg = await getCaseAggregate(caseId);
  const c = agg.canonical;
  const broker = await getBrokerInfo(organizationId);

  const applicants = c.applicants.map((a) => {
    const emp = c.employment.find((e) => e.applicantPosition === a.position);
    const inc = c.income.find((i) => i.applicantPosition === a.position);
    const empLabel = emp?.beschaeftigungsart
      ? [EMPLOYMENT_TYPE_LABELS[emp.beschaeftigungsart as EmploymentType], emp.beruf].filter(Boolean).join(" · ")
      : emp?.beruf;
    return {
      name: [a.vorname, a.nachname].filter(Boolean).join(" "),
      birthDate: a.geburtsdatum ? dateStr(new Date(a.geburtsdatum)) : undefined,
      maritalStatus: a.familienstand,
      employment: empLabel,
      incomeNet: inc?.nettoMonatlich != null ? formatEUR(inc.nettoMonatlich) : undefined,
    };
  });

  const p = c.property;
  const f = c.financing;

  const data: BankSummaryData = {
    caseNumber: agg.caseNumber,
    dateStr: dateStr(),
    broker,
    applicants,
    property: {
      type: p?.objektart ? PROPERTY_TYPE_LABELS[p.objektart as PropertyType] : undefined,
      address: [p?.strasse, [p?.plz, p?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || undefined,
      livingArea: p?.wohnflaeche != null ? `${p.wohnflaeche} m²` : undefined,
      buildYear: p?.baujahr != null ? String(p.baujahr) : undefined,
      usage: p?.nutzung,
    },
    financing: {
      kaufpreis: f.kaufpreis != null ? formatEUR(f.kaufpreis) : undefined,
      nebenkosten: f.nebenkosten != null ? formatEUR(f.nebenkosten) : undefined,
      eigenkapital: f.eigenkapital != null ? formatEUR(f.eigenkapital) : undefined,
      darlehenswunsch: f.darlehenswunsch != null ? formatEUR(f.darlehenswunsch) : undefined,
    },
    documentsPresent: agg.checklist.filter((i) => i.status === "vorhanden").map((i) => i.name),
    documentsMissing: agg.missing.map((i) => i.name),
    // Neutrale Hinweise: Plausibilitätsbefunde sachlich, ohne Bewertung der Machbarkeit.
    notes: agg.plausibility.filter((pc) => pc.status !== "ok").map((pc) => pc.explanation),
    openPoints: agg.missing.map((i) => i.name),
  };

  return { data, fileName: pdfFileName("Bankzusammenfassung", c.applicants) };
}

export async function buildChecklistData(caseId: string, organizationId: string): Promise<{ data: ChecklistData; fileName: string }> {
  const agg = await getCaseAggregate(caseId);
  const broker = await getBrokerInfo(organizationId);
  // Nur kundensichtbare Positionen – keine internen KO-Kriterien.
  const items = agg.checklist
    .filter((i) => i.customerVisible)
    .map((i) => ({ name: i.name, description: i.customerDescription, done: i.status === "vorhanden" }));

  return {
    data: {
      customerName: applicantDisplayNames(agg.canonical.applicants),
      dateStr: dateStr(),
      broker,
      items,
    },
    fileName: pdfFileName("Unterlagencheckliste", agg.canonical.applicants),
  };
}

export async function buildAuditProtocolData(caseId: string, organizationId: string): Promise<{ data: AuditProtocolData; fileName: string }> {
  const broker = await getBrokerInfo(organizationId);
  const caseRow = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { applicants: { orderBy: { position: "asc" } } },
  });
  const logs = await prisma.auditLog.findMany({
    where: { organizationId, entityId: caseId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true } } },
  });

  const entries = logs.map((l) => ({
    date: l.createdAt.toLocaleString("de-DE"),
    actor: l.user?.name ?? "System",
    action: l.action,
    detail: l.metadata ? Object.keys(l.metadata as object).slice(0, 4).join(", ") : undefined,
  }));

  return {
    data: { caseNumber: caseRow.caseNumber, dateStr: dateStr(), broker, entries },
    fileName: pdfFileName("Pruefprotokoll", caseRow.applicants),
  };
}

export async function buildPlatformExportData(
  caseId: string,
  organizationId: string,
  platform: Platform
): Promise<{ data: PlatformExportData; fileName: string }> {
  const broker = await getBrokerInfo(organizationId);
  const canonical = await caseToCanonical(caseId);
  const mapping = buildPlatformMapping(canonical, platform);
  const stored = await prisma.platformMapping.findUnique({
    where: { caseId_platform: { caseId, platform } },
    select: { released: true },
  });
  const caseRow = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { applicants: { orderBy: { position: "asc" } } },
  });

  const allFields = mapping.groups.flatMap((g) => g.fields);
  const fields = allFields.map((fld) => ({
    label: fld.label,
    value: fld.value == null || fld.value === "" ? "—" : String(fld.value),
    status: fld.value == null || fld.value === "" ? "fehlt" : undefined,
  }));
  const requiredFields = allFields.filter((fld) => fld.requiresReview);
  const totalRequired = requiredFields.length || 1;
  const presentRequired = requiredFields.filter((fld) => fld.value != null && fld.value !== "").length;
  const readinessPercent = Math.round((presentRequired / totalRequired) * 100);

  return {
    data: {
      caseNumber: caseRow.caseNumber,
      dateStr: dateStr(),
      broker,
      platformLabel: PLATFORM_LABELS[platform],
      readinessPercent,
      released: stored?.released ?? false,
      fields,
      missingFields: mapping.missingRequiredFields,
      missingDocuments: [],
    },
    fileName: pdfFileName(`Export_${PLATFORM_LABELS[platform]}`, caseRow.applicants),
  };
}

export async function buildWohnflaecheData(
  caseId: string,
  organizationId: string
): Promise<{ data: WohnflaecheData; fileName: string } | null> {
  const broker = await getBrokerInfo(organizationId);
  const caseRow = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { applicants: { orderBy: { position: "asc" } } },
  });
  const latest = await prisma.wohnflaechenBerechnung.findFirst({
    where: { caseId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return null;
  const rooms = (latest.rooms as unknown as WohnflaecheData["rooms"]) ?? [];
  return {
    data: {
      caseNumber: caseRow.caseNumber,
      dateStr: dateStr(),
      broker,
      rooms,
      summeWohnflaeche: latest.summeWohnflaeche,
      summeZubehoer: latest.summeZubehoer,
    },
    fileName: pdfFileName("Wohnflaechenberechnung", caseRow.applicants),
  };
}
