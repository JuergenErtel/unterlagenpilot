import { prisma } from "@/lib/db";
import { getCaseAggregate } from "./service";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { readinessTone, type Tone } from "@/lib/ui/tone";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/domain/enums";

export interface CockpitData {
  caseId: string;
  caseNumber: string;
  applicantNames: string;
  status: string;
  score: number;
  scoreTone: Tone;
  scoreLabel: string;
  blockers: string[];
  platformReadiness: Array<{ platform: Platform; percent: number; missingFields: number; missingDocs: number }>;
  roadmap: Array<{ title: string; tone: Tone; summary: string; blocker?: string; action?: { label: string; href: string } }>;
  nextActions: Array<{ title: string; detail?: string; href?: string; tone?: Tone }>;
  missingGroups: Array<{
    key: string;
    title: string;
    tone: Tone;
    items: Array<{ key: string; title: string; reason: string; platform?: Platform | "allgemein"; internalNote?: string }>;
  }>;
  counts: { docsPresent: number; docsMissing: number; pruefbereit: number; warnings: number };
}

export async function getCaseCockpit(caseId: string): Promise<CockpitData> {
  const agg = await getCaseAggregate(caseId);
  const [caseRow, docs, missingRequests] = await Promise.all([
    prisma.case.findUniqueOrThrow({ where: { id: caseId }, include: { applicants: { orderBy: { position: "asc" } } } }),
    prisma.document.findMany({ where: { caseId }, select: { reviewStatus: true, classificationStatus: true, documentType: true } }),
    prisma.missingDocumentRequest.findMany({ where: { caseId, resolved: false } }),
  ]);

  const applicantNames =
    caseRow.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(" & ") || "Ohne Namen";

  // Kundendaten-Lücken (Pflichtfelder)
  const missingCustomerFields: string[] = [];
  caseRow.applicants.forEach((a) => {
    if (!a.geburtsdatum) missingCustomerFields.push(`Geburtsdatum ${a.vorname ?? `Antragsteller ${a.position}`}`);
  });

  const docsPresent = docs.filter((d) => d.reviewStatus !== "abgelehnt" && d.reviewStatus !== "duplikat").length;
  const pruefbereit = docs.filter((d) => d.reviewStatus === "offen" && d.classificationStatus === "fertig").length;
  const warnings = agg.plausibility.filter((p) => p.status !== "ok").length;
  const criticals = agg.plausibility.filter((p) => p.status === "kritisch");

  const blockers = [
    ...missingCustomerFields.map((f) => `${f} fehlt`),
    ...criticals.map((c) => c.explanation),
  ].slice(0, 4);

  // Plattform-Bereitschaft
  const platformReadiness = PLATFORMS.map((p) => {
    const payload = buildPlatformMapping(agg.canonical, p);
    const missingFields = payload.missingRequiredFields.length;
    const missingDocs = agg.missing.filter((m) => m.platforms.includes(p) || m.platforms.length === 3).length;
    const percent = Math.max(0, Math.min(100, 100 - missingFields * 14 - missingDocs * 10));
    return { platform: p, percent, missingFields, missingDocs };
  });

  // Roadmap (6 Schritte)
  const roadmap: CockpitData["roadmap"] = [
    {
      title: "Kundendaten",
      tone: missingCustomerFields.length > 0 ? "blocker" : "ready",
      summary: missingCustomerFields.length > 0 ? `${missingCustomerFields.length} Pflichtfeld(er) fehlen: ${missingCustomerFields.join(", ")}` : "Alle Pflichtangaben vollständig.",
      blocker: missingCustomerFields.length > 0 ? "blockiert Einreichung" : undefined,
      action: missingCustomerFields.length > 0 ? { label: "Kundendaten ergänzen", href: `/cases/${caseId}/edit` } : undefined,
    },
    {
      title: "Dokumente",
      tone: agg.missing.length > 0 ? "review" : "ready",
      summary: `${docsPresent} vorhanden, ${agg.missing.length} fehlen.`,
      action: { label: "Upload-Link erstellen", href: `/cases/${caseId}` },
    },
    {
      title: "KI-Auswertung",
      tone: pruefbereit > 0 ? "ai" : docsPresent > 0 ? "ready" : "neutral",
      summary: pruefbereit > 0 ? `${pruefbereit} Dokument(e) prüfbereit.` : "Keine offenen KI-Ergebnisse.",
      action: pruefbereit > 0 ? { label: "Review-Center öffnen", href: `/review?case=${caseId}` } : undefined,
    },
    {
      title: "Plausibilität",
      tone: criticals.length > 0 ? "blocker" : warnings > 0 ? "review" : "ready",
      summary: warnings > 0 ? `${warnings} Hinweis(e), davon ${criticals.length} kritisch.` : "Keine Auffälligkeiten.",
    },
    {
      title: "Nachforderung",
      tone: agg.missing.length > 0 ? "ai" : "ready",
      summary: agg.missing.length > 0 ? "Bereit – fehlende Unterlagen können angefordert werden." : "Nichts offen.",
      action: agg.missing.length > 0 ? { label: "Nachforderung erzeugen", href: `/cases/${caseId}/messages` } : undefined,
    },
    {
      title: "Plattform-Export",
      tone: platformReadiness.every((p) => p.percent >= 90) ? "ready" : platformReadiness.some((p) => p.percent >= 60) ? "review" : "blocker",
      summary: platformReadiness.map((p) => `${PLATFORM_LABELS[p.platform]} ${p.percent}%`).join(" · "),
      action: { label: "Einreichungsassistent öffnen", href: `/cases/${caseId}/export` },
    },
  ];

  // Nächste beste Aktionen
  const nextActions: CockpitData["nextActions"] = [];
  missingCustomerFields.forEach((f) => nextActions.push({ title: `${f} ergänzen`, detail: "Pflichtfeld – blockiert die Einreichung.", href: `/cases/${caseId}/edit`, tone: "blocker" }));
  agg.missing.slice(0, 2).forEach((m) => nextActions.push({ title: `${m.name} nachfordern`, detail: "Fehlende Unterlage beim Kunden anfordern.", href: `/cases/${caseId}/messages`, tone: "ai" }));
  if (pruefbereit > 0) nextActions.push({ title: "Erkannte Felder prüfen & freigeben", detail: `${pruefbereit} Dokument(e) im Review-Center.`, href: `/review?case=${caseId}`, tone: "ai" });
  nextActions.push({ title: "Europace-Kopiermaske vorbereiten", detail: "Geprüfte Felder für die Einreichung übernehmen.", href: `/cases/${caseId}/export?platform=europace`, tone: "neutral" });

  // Fehlende Unterlagen gruppiert
  const missingGroups = buildMissingGroups(agg.missing, missingRequests);

  const band = readinessTone(agg.readiness.score);
  return {
    caseId,
    caseNumber: caseRow.caseNumber,
    applicantNames,
    status: caseRow.status,
    score: agg.readiness.score,
    scoreTone: band.tone,
    scoreLabel: band.label,
    blockers,
    platformReadiness,
    roadmap,
    nextActions: nextActions.slice(0, 5),
    missingGroups,
    counts: { docsPresent, docsMissing: agg.missing.length, pruefbereit, warnings },
  };
}

function buildMissingGroups(
  aggMissing: Awaited<ReturnType<typeof getCaseAggregate>>["missing"],
  requests: Array<{ requirementKey: string; title: string; reason: string; level: string; platform: string | null }>
): CockpitData["missingGroups"] {
  const sofort = aggMissing.filter((m) => m.level === "zwingend");
  const spaeter = aggMissing.filter((m) => m.level === "spaeter");
  const bank = aggMissing.filter((m) => m.level === "bankabhaengig");

  const reqItems = requests.map((r) => ({
    key: r.requirementKey,
    title: r.title,
    reason: r.reason,
    platform: (r.platform ?? "allgemein") as Platform | "allgemein",
  }));

  const groups: CockpitData["missingGroups"] = [
    { key: "sofort", title: "Sofort erforderlich", tone: "blocker", items: reqItems.length ? reqItems : sofort.map((m) => ({ key: m.key, title: m.name, reason: "Pflichtunterlage – blockiert die Einreichung.", platform: (m.platforms[0] ?? "allgemein") as Platform | "allgemein" })) },
    { key: "spaeter", title: "Später erforderlich", tone: "review", items: spaeter.map((m) => ({ key: m.key, title: m.name, reason: "Wird im weiteren Verlauf benötigt.", platform: (m.platforms[0] ?? "allgemein") as Platform | "allgemein" })) },
    { key: "bank", title: "Nur für bestimmte Banken", tone: "neutral", items: bank.map((m) => ({ key: m.key, title: m.name, reason: "Je nach Bankanforderung erforderlich.", platform: "allgemein" as const })) },
  ];
  return groups.filter((g) => g.items.length > 0);
}
