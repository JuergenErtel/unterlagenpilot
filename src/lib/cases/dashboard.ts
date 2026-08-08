import { prisma } from "@/lib/db";
import { getCaseAggregate } from "./service";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { casesToCanonical } from "@/lib/platforms/case-loader";
import { selectDueFollowups, type DueFollowup } from "@/lib/cases/reminders";
import { computeNextStep } from "@/lib/cases/next-step";
import type { Platform, CaseStatus } from "@/lib/domain/enums";
import type { TodoCase } from "@/components/dashboard/todo-case-card";

export interface DashboardData {
  kpis: {
    offen: number;
    neueUploads: number;
    pruefbereit: number;
    unterlagenFehlen: number;
    bereitEuropace: number;
    bereitFinlink: number;
    bereitEhyp: number;
    zeitersparnisMin: number;
    /** Fälle der letzten 7 Tage, die nicht von Hand angelegt wurden. */
    neueLeads: number;
  };
  pipeline: Array<{ key: string; label: string; count: number }>;
  todos: TodoCase[];
  followups: DueFollowup[];
}

/** Terminale Status – zählen nicht als „offen". */
const TERMINAL_STATUSES: CaseStatus[] = ["abgeschlossen", "archiviert"];

export async function getDashboardData(organizationId: string): Promise<DashboardData> {
  // KPIs und Pipeline MÜSSEN über alle Fälle der Organisation zählen – eine
  // Auswertung des „letzte 12"-Ausschnitts lieferte ab dem 13. Fall stillschweigend
  // zu niedrige Zahlen.
  const [statusGroups, neueUploads, pruefbereit, docsProcessed] = await Promise.all([
    prisma.case.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.document.count({ where: { case: { organizationId }, reviewStatus: "offen", ocrStatus: "fertig" } }),
    prisma.document.count({ where: { case: { organizationId }, reviewStatus: "offen", classificationStatus: "fertig" } }),
    prisma.document.count({ where: { case: { organizationId }, classificationStatus: "fertig" } }),
  ]);

  const countByStatus = new Map<string, number>(
    statusGroups.map((g) => [g.status as string, g._count._all])
  );
  const byStatus = (s: CaseStatus[]) => s.reduce((sum, k) => sum + (countByStatus.get(k) ?? 0), 0);
  const offen = [...countByStatus.entries()]
    .filter(([s]) => !TERMINAL_STATUSES.includes(s as CaseStatus))
    .reduce((sum, [, n]) => sum + n, 0);

  // Plattform-Bereitschaft über ALLE aktiven Fälle – Batch-Load (eine Query)
  // statt einer Abfrage je Fall.
  const activeWhere = { organizationId, status: { notIn: TERMINAL_STATUSES } };
  const canonicalByCase = await casesToCanonical(activeWhere);
  const readyCount: Record<Platform, number> = { europace: 0, finlink: 0, ehyp_home: 0 };
  const readyByCase = new Map<string, Record<Platform, boolean>>();
  for (const [caseId, canonical] of canonicalByCase) {
    const ready: Record<Platform, boolean> = {
      europace: buildPlatformMapping(canonical, "europace").missingRequiredFields.length === 0,
      finlink: buildPlatformMapping(canonical, "finlink").missingRequiredFields.length === 0,
      ehyp_home: buildPlatformMapping(canonical, "ehyp_home").missingRequiredFields.length === 0,
    };
    readyByCase.set(caseId, ready);
    for (const p of Object.keys(ready) as Platform[]) if (ready[p]) readyCount[p] += 1;
  }

  const neueLeads = await prisma.case.count({
    where: {
      organizationId,
      createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
      quelle: { not: "manuell" },
    },
  });

  const kpis: DashboardData["kpis"] = {
    offen,
    neueUploads,
    pruefbereit,
    unterlagenFehlen: byStatus(["unterlagen_fehlen"]),
    bereitEuropace: readyCount.europace,
    bereitFinlink: readyCount.finlink,
    bereitEhyp: readyCount.ehyp_home,
    // grobe Schätzung: 8 Min je KI-verarbeitetem Dokument
    zeitersparnisMin: docsProcessed * 8,
    neueLeads,
  };

  const pipeline = [
    { key: "importiert", label: "Importiert", count: byStatus(["neu"]) },
    { key: "upload", label: "Upload offen", count: byStatus(["upload_offen"]) },
    { key: "ki", label: "KI geprüft", count: byStatus(["ki_pruefung_laeuft", "vermittlerpruefung_erforderlich"]) },
    { key: "fehlt", label: "Unterlagen fehlen", count: byStatus(["unterlagen_fehlen"]) },
    { key: "pruef", label: "Prüffertig", count: byStatus(["einreichungsfertig"]) },
    { key: "export", label: "Exportbereit", count: byStatus(["exportiert", "uebertragen"]) },
  ];

  // To-do-Karten: nur für die zuletzt bearbeiteten aktiven Fälle die teure
  // Aggregation fahren (die Karten zeigen ohnehin höchstens sechs).
  const todoCandidates = await prisma.case.findMany({
    where: activeWhere,
    include: { applicants: { orderBy: { position: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 12,
  });

  // Dokument-Status für alle Kandidaten in EINER Query – speist die
  // Next-Step-Engine (gleiche Prioritätsleiter wie auf der Fallseite).
  const todoDocs = await prisma.document.findMany({
    where: { caseId: { in: todoCandidates.map((c) => c.id) } },
    select: { caseId: true, reviewStatus: true, classificationStatus: true, extractionStatus: true },
  });

  // Selbstauskunft je Kandidat – ebenfalls in EINER Query, damit das Dashboard
  // dieselbe Prioritätsleiter sieht wie die Fallseite.
  const todoBoegen = await prisma.selfDisclosure.findMany({
    where: { caseId: { in: todoCandidates.map((c) => c.id) } },
    orderBy: { createdAt: "desc" },
    select: {
      caseId: true,
      currentStep: true,
      submittedAt: true,
      takenOverAt: true,
      link: { select: { createdAt: true } },
    },
  });
  const bogenJeFall = new Map<string, (typeof todoBoegen)[number]>();
  for (const b of todoBoegen) if (!bogenJeFall.has(b.caseId)) bogenJeFall.set(b.caseId, b);

  // Erstkontakt-Stand je Kandidat – ebenfalls in EINER Query, damit das
  // Dashboard dieselbe Prioritätsleiter sieht wie die Fallseite (next-step.ts).
  const erstkontaktNachrichten = await prisma.generatedMessage.findMany({
    where: { id: { in: todoCandidates.map((c) => c.erstkontaktMessageId).filter((mid): mid is string => !!mid) } },
    select: { id: true, sent: true },
  });
  const versendetJeNachricht = new Map(erstkontaktNachrichten.map((m) => [m.id, m.sent]));

  const enriched = await Promise.all(
    todoCandidates.map(async (c) => {
      const agg = await getCaseAggregate(c.id);
      const platformReady = readyByCase.get(c.id) ?? { europace: false, finlink: false, ehyp_home: false };
      const name =
        c.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(" & ") ||
        "Ohne Namen";
      const docs = todoDocs.filter((d) => d.caseId === c.id);
      const step = computeNextStep({
        caseId: c.id,
        status: c.status,
        counts: {
          pruefbereit: docs.filter((d) => d.reviewStatus === "offen" && d.classificationStatus === "fertig").length,
          docsMissing: agg.missing.length,
          criticals: agg.plausibility.filter((p) => p.status === "kritisch").length,
          docsFehler: docs.filter((d) => d.classificationStatus === "fehler" || d.extractionStatus === "fehler").length,
          docsLaufend: docs.filter((d) => d.classificationStatus === "laeuft").length,
        },
        missingCustomerFields: c.applicants
          .filter((a) => !a.geburtsdatum)
          .map((a) => `Geburtsdatum ${a.vorname ?? `Antragsteller ${a.position}`}`),
        selbstauskunft: (() => {
          const b = bogenJeFall.get(c.id);
          if (!b?.link) return undefined;
          return {
            eingegangen: Boolean(b.submittedAt) && !b.takenOverAt,
            begonnen: Boolean(b.currentStep) || Boolean(b.submittedAt),
            erstelltVorTagen: Math.floor((Date.now() - b.link.createdAt.getTime()) / 86400_000),
          };
        })(),
        erstkontakt: {
          empfaenger: c.applicants.map((a) => a.email).find((e): e is string => !!e && e.includes("@")) ?? null,
          vorbereitet: Boolean(c.erstkontaktMessageId),
          versendet: c.erstkontaktMessageId ? (versendetJeNachricht.get(c.erstkontaktMessageId) ?? false) : false,
        },
      });
      const blockers = (Object.keys(platformReady) as Platform[]).filter((p) => !platformReady[p] && p !== "finlink");
      return { c, agg, name, step, blockers };
    })
  );

  // To-dos priorisiert (niedrigster Score / meiste Lücken zuerst)
  const todos: TodoCase[] = enriched
    .sort((a, b) => a.agg.readiness.score - b.agg.readiness.score)
    .slice(0, 6)
    .map((e) => ({
      caseId: e.c.id,
      caseNumber: e.c.caseNumber,
      name: e.name,
      status: e.c.status as CaseStatus,
      readiness: e.agg.readiness.score,
      nextStep: e.step.title,
      blockers: e.blockers,
      buttonLabel: e.step.cta?.label ?? "Fall öffnen",
      buttonHref: e.step.cta?.href ?? `/cases/${e.c.id}`,
    }));

  // "Heute fällig": Wiedervorlagen, Fristen und offene Bank-Nachforderungen.
  const followupRows = await prisma.case.findMany({
    where: {
      organizationId,
      status: { notIn: TERMINAL_STATUSES },
      OR: [
        { wiedervorlage: { not: null } },
        { deadlines: { some: { done: false } } },
        { missingRequests: { some: { requestSource: "bank", resolved: false } } },
      ],
    },
    select: {
      id: true,
      caseNumber: true,
      wiedervorlage: true,
      applicants: { orderBy: { position: "asc" }, select: { vorname: true, nachname: true } },
      deadlines: { where: { done: false }, orderBy: { dueDate: "asc" }, take: 1, select: { title: true, dueDate: true } },
      _count: { select: { missingRequests: { where: { requestSource: "bank", resolved: false } } } },
    },
    take: 100,
  });
  const followups = selectDueFollowups(
    followupRows.map((c) => ({
      caseId: c.id,
      caseNumber: c.caseNumber,
      kundenName:
        c.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(" & ") ||
        "Ohne Namen",
      wiedervorlage: c.wiedervorlage,
      naechsteFrist: c.deadlines[0] ?? null,
      offeneBankforderungen: c._count.missingRequests,
    })),
    new Date()
  ).slice(0, 8);

  return { kpis, pipeline, todos, followups };
}

