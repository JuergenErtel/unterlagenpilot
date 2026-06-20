import { prisma } from "@/lib/db";
import { getCaseAggregate } from "./service";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { caseToCanonical } from "@/lib/platforms/case-loader";
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
}

export async function getDashboardData(organizationId: string): Promise<DashboardData> {
  const cases = await prisma.case.findMany({
    where: { organizationId },
    include: { applicants: { orderBy: { position: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 12,
  });

  const [neueUploads, pruefbereit, docsProcessed] = await Promise.all([
    prisma.document.count({ where: { case: { organizationId }, reviewStatus: "offen", ocrStatus: "fertig" } }),
    prisma.document.count({ where: { case: { organizationId }, reviewStatus: "offen", classificationStatus: "fertig" } }),
    prisma.document.count({ where: { case: { organizationId }, classificationStatus: "fertig" } }),
  ]);

  // Pro Fall live auswerten (Demo: wenige Fälle)
  const enriched = await Promise.all(
    cases.map(async (c) => {
      const agg = await getCaseAggregate(c.id);
      const canonical = await caseToCanonical(c.id);
      const platformReady: Record<Platform, boolean> = {
        europace: buildPlatformMapping(canonical, "europace").missingRequiredFields.length === 0,
        finlink: buildPlatformMapping(canonical, "finlink").missingRequiredFields.length === 0,
        ehyp_home: buildPlatformMapping(canonical, "ehyp_home").missingRequiredFields.length === 0,
      };
      const name = c.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(" & ") || "Ohne Namen";
      const geburtsLücke = c.applicants.some((a) => !a.geburtsdatum);
      const nextStep = buildNextStep(geburtsLücke, agg.missing.map((m) => m.name));
      const blockers = (Object.keys(platformReady) as Platform[]).filter((p) => !platformReady[p] && p !== "finlink");
      return { c, agg, name, nextStep, blockers, platformReady };
    })
  );

  const kpis: DashboardData["kpis"] = {
    offen: cases.filter((c) => !["abgeschlossen", "archiviert"].includes(c.status)).length,
    neueUploads,
    pruefbereit,
    unterlagenFehlen: cases.filter((c) => c.status === "unterlagen_fehlen").length,
    bereitEuropace: enriched.filter((e) => e.platformReady.europace).length,
    bereitFinlink: enriched.filter((e) => e.platformReady.finlink).length,
    bereitEhyp: enriched.filter((e) => e.platformReady.ehyp_home).length,
    // grobe Schätzung: 8 Min je KI-verarbeitetem Dokument
    zeitersparnisMin: docsProcessed * 8,
  };

  const byStatus = (s: CaseStatus[]) => cases.filter((c) => s.includes(c.status as CaseStatus)).length;
  const pipeline = [
    { key: "importiert", label: "Importiert", count: byStatus(["neu"]) },
    { key: "upload", label: "Upload offen", count: byStatus(["upload_offen"]) },
    { key: "ki", label: "KI geprüft", count: byStatus(["ki_pruefung_laeuft", "vermittlerpruefung_erforderlich"]) },
    { key: "fehlt", label: "Unterlagen fehlen", count: byStatus(["unterlagen_fehlen"]) },
    { key: "pruef", label: "Prüffertig", count: byStatus(["einreichungsfertig"]) },
    { key: "export", label: "Exportbereit", count: byStatus(["exportiert", "uebertragen"]) },
  ];

  // To-dos priorisiert (niedrigster Score / meiste Lücken zuerst)
  const todos: TodoCase[] = enriched
    .filter((e) => !["abgeschlossen", "archiviert"].includes(e.c.status))
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

  return { kpis, pipeline, todos };
}

function buildNextStep(geburtsLücke: boolean, missing: string[]): string {
  const parts: string[] = [];
  if (geburtsLücke) parts.push("Geburtsdatum ergänzen");
  if (missing.length) parts.push(`${missing.slice(0, 2).join(" & ")} nachfordern`);
  parts.push("KI-Prüfung freigeben");
  return parts.join(", ");
}
