import { prisma } from "@/lib/db";
import { getCaseAggregate } from "./service";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { casesToCanonical } from "@/lib/platforms/case-loader";
import { selectDueFollowups, type DueFollowup } from "@/lib/cases/reminders";
import { computeNextStep, type NextStep } from "@/lib/cases/next-step";
import {
  kontaktStand,
  kontaktEinstellungen,
  kontaktStartAb,
  giltKontaktaufnahmeFuer,
} from "@/lib/cases/kontakt";
import { isAnyAiCheckRunning, withAiCheckStaleOverride } from "@/lib/cases/ai-check-status";
import { countDocumentsWithoutAiResult, countRunningClassifications } from "@/lib/documents/processing";
import { ladeSelbstauskunftStandBatch } from "@/lib/cases/selbstauskunft-stand";
import { berechneReife } from "@/lib/erstgespraech/reife";
import type { Fallstand } from "@/lib/self-disclosure/takeover";
import { MAX_APPLICANTS, type Platform, type CaseStatus } from "@/lib/domain/enums";
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
    // Nur die letzten 7 Tage – das Label verspricht "diese Woche", gezählt
    // wurde bis zum 20.08.2026 aber der gesamte Bestand.
    prisma.document.count({
      where: {
        case: { organizationId },
        classificationStatus: "fertig",
        updatedAt: { gte: new Date(Date.now() - 7 * 86400_000) },
      },
    }),
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

  return { kpis, pipeline };
}

