import { prisma } from "@/lib/db";
import { getCaseAggregate } from "./service";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { casesToCanonical } from "@/lib/platforms/case-loader";
import { selectDueFollowups, type DueFollowup } from "@/lib/cases/reminders";
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

  const enriched = await Promise.all(
    todoCandidates.map(async (c) => {
      const agg = await getCaseAggregate(c.id);
      const platformReady = readyByCase.get(c.id) ?? { europace: false, finlink: false, ehyp_home: false };
      const name =
        c.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(" & ") ||
        "Ohne Namen";
      const geburtsLücke = c.applicants.some((a) => !a.geburtsdatum);
      const nextStep = buildNextStep(geburtsLücke, agg.missing.map((m) => m.name));
      const blockers = (Object.keys(platformReady) as Platform[]).filter((p) => !platformReady[p] && p !== "finlink");
      return { c, agg, name, nextStep, blockers };
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
      nextStep: e.nextStep,
      blockers: e.blockers,
      buttonLabel: "Fall einreichungsfertig machen",
      buttonHref: `/cases/${e.c.id}`,
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

function buildNextStep(geburtsLücke: boolean, missing: string[]): string {
  const parts: string[] = [];
  if (geburtsLücke) parts.push("Geburtsdatum ergänzen");
  if (missing.length) parts.push(`${missing.slice(0, 2).join(" & ")} nachfordern`);
  parts.push("KI-Prüfung freigeben");
  return parts.join(", ");
}
