import { prisma } from "@/lib/db";
import { getCaseAggregate, type CaseAggregate } from "./service";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { readinessTone, type Tone } from "@/lib/ui/tone";
import type { Auslaufband } from "@/lib/machbarkeit/bewertung";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/domain/enums";
import { ladeSelbstauskunftStand } from "./selbstauskunft-stand";
import { countRunningClassifications } from "@/lib/documents/processing";

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
  roadmap: Array<{ title: string; tone: Tone; summary: string; blocker?: string; action?: { label: string; href: string }; actions?: Array<{ label: string; href: string; variant?: "default" | "outline" }> }>;
  nextActions: Array<{ title: string; detail?: string; href?: string; tone?: Tone }>;
  missingGroups: Array<{
    key: string;
    title: string;
    tone: Tone;
    items: Array<{ key: string; title: string; reason: string; platform?: Platform | "allgemein"; internalNote?: string }>;
  }>;
  counts: {
    docsPresent: number;
    docsMissing: number;
    pruefbereit: number;
    warnings: number;
    criticals: number;
    docsFehler: number;
    docsLaufend: number;
    /** Offene Lücken des Unterlagen-Detektivs (offen + unsicher). */
    offeneBefunde: number;
    /** Solver hatte genug Daten und sagt "nicht darstellbar". */
    machbarkeitBlockiert: boolean;
  };
  missingCustomerFields: string[];
  /**
   * Das vollstaendige Machbarkeitsurteil, wenn die Daten dafuer reichten.
   *
   * `null` heisst "nicht berechenbar", NICHT "nicht machbar" – die Anzeige muss
   * das unterscheiden. Wird aus derselben Berechnung gefuellt wie
   * `counts.machbarkeitBlockiert`, damit der Solver nicht zweimal laeuft.
   */
  machbarkeit: { auslauf: number; band: Auslaufband; ueberschuss: number; machbar: boolean } | null;
  /** Stand der Selbstauskunft; fehlt, solange kein Link erstellt wurde. */
  selbstauskunft?: {
    eingegangen: boolean;
    begonnen: boolean;
    erstelltVorTagen: number | null;
  };
  /** Nur gesetzt, wenn fuer diesen Fall schon Europace-Anforderungen geholt wurden. */
  anforderungsAbgleich: CaseAggregate["anforderungsAbgleich"];
}

export async function getCaseCockpit(caseId: string): Promise<CockpitData> {
  const agg = await getCaseAggregate(caseId);
  const [caseRow, docs, missingRequests, sdStand] = await Promise.all([
    prisma.case.findUniqueOrThrow({ where: { id: caseId }, include: { applicants: { orderBy: { position: "asc" } } } }),
    prisma.document.findMany({
      where: { caseId },
      // `updatedAt` gehört dazu: An ihm allein hängt das Alter eines laufenden
      // Dokuments (countRunningClassifications) – der Fallstatus sagt beim
      // normalen Upload nichts darüber.
      select: {
        reviewStatus: true,
        classificationStatus: true,
        extractionStatus: true,
        documentType: true,
        updatedAt: true,
      },
    }),
    prisma.missingDocumentRequest.findMany({ where: { caseId, resolved: false } }),
    // EINE Quelle für den Selbstauskunft-Stand (siehe selbstauskunft-stand.ts):
    // Ein zuvor beim Erstkontakt erzeugter, noch nicht geöffneter Link hat
    // noch keinen SelfDisclosure-Datensatz – wer nur danach sucht, übersieht
    // ihn und die "Selbstauskunft nachfassen"-Stufe greift nie.
    ladeSelbstauskunftStand(caseId),
  ]);

  // Nur ein noch nicht übernommener, eingegangener Bogen ist ein nächster
  // Schritt; ein übernommener ist erledigt.
  const selbstauskunft = sdStand.linkId
    ? {
        eingegangen: sdStand.eingegangen,
        begonnen: sdStand.begonnen,
        erstelltVorTagen: sdStand.erstelltVorTagen,
      }
    : undefined;

  const applicantNames =
    caseRow.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(" & ") || "Ohne Namen";

  // Kundendaten-Lücken (Pflichtfelder)
  const missingCustomerFields: string[] = [];
  caseRow.applicants.forEach((a) => {
    if (!a.geburtsdatum) missingCustomerFields.push(`Geburtsdatum ${a.vorname ?? `Antragsteller ${a.position}`}`);
  });

  const docsPresent = docs.filter(
    (d) =>
      d.reviewStatus !== "abgelehnt" &&
      d.reviewStatus !== "duplikat" &&
      // Ersetzt = durch Teildokumente abgeloest; sonst Doppelzaehlung.
      d.reviewStatus !== "ersetzt"
  ).length;
  const pruefbereit = docs.filter((d) => d.reviewStatus === "offen" && d.classificationStatus === "fertig").length;
  const docsFehler = docs.filter((d) => d.classificationStatus === "fehler" || d.extractionStatus === "fehler").length;
  const docsLaufend = countRunningClassifications(docs);
  const warnings = agg.plausibility.filter((p) => p.status !== "ok").length;
  const criticals = agg.plausibility.filter((p) => p.status === "kritisch");
  // Unterlagen-Detektiv: was der Vermittler noch nicht gesichtet hat.
  const offeneBefunde = await prisma.caseFinding.count({
    where: { caseId, status: { in: ["offen", "unsicher"] } },
  });

  // Machbarkeit: nur ein Urteil faellen, wenn die Daten dafuer reichen. Bei
  // duenner Datenlage bleibt es false – sonst warnt die Leiter vor Faellen,
  // ueber die sie nichts weiss. Ein Fehler hier darf das Cockpit nie kippen.
  const machbarkeitUrteil = await (async (): Promise<CockpitData["machbarkeit"]> => {
    try {
      const [{ baueEingabe }, { ladeAnnahmen }, { bewerte }, { caseToCanonical }] = await Promise.all([
        import("@/lib/machbarkeit/eingabe"),
        import("@/lib/machbarkeit/annahmen"),
        import("@/lib/machbarkeit/bewertung"),
        import("@/lib/platforms/case-loader"),
      ]);
      const fall = await prisma.case.findUniqueOrThrow({
        where: { id: caseId },
        select: {
          organizationId: true,
          applicants: { select: { anzahlKinder: true }, orderBy: { position: "asc" } },
          property: { select: { bundesland: true } },
          financingRequest: { select: { grunderwerbsteuerProzent: true } },
        },
      });
      const e = baueEingabe(await caseToCanonical(caseId), {
        applicantCount: Math.max(fall.applicants.length, 1),
        anzahlKinder: fall.applicants[0]?.anzahlKinder ?? 0,
        grunderwerbsteuerProzentOverride: fall.financingRequest?.grunderwerbsteuerProzent ?? null,
        bundeslandOverride: (fall.property?.bundesland as never) ?? null,
      });
      if (!e.ok) return null;
      const u = bewerte(e.eingabe, await ladeAnnahmen(fall.organizationId));
      return { auslauf: u.auslauf, band: u.band, ueberschuss: u.ueberschuss, machbar: u.machbar };
    } catch (err) {
      console.error(`[cockpit] Machbarkeitspruefung fuer Fall ${caseId} fehlgeschlagen:`, err);
      return null;
    }
  })();

  // Ohne Urteil bleibt es bei "nicht blockiert": Die Leiter darf nicht vor
  // Faellen warnen, ueber die sie nichts weiss (siehe Machbarkeits-Ampel).
  const machbarkeitBlockiert = machbarkeitUrteil ? !machbarkeitUrteil.machbar : false;

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
      actions: [
        { label: "Selbst hochladen", href: `/cases/${caseId}?tab=dokumente#broker-upload`, variant: "default" },
        { label: "Upload-Link erstellen", href: `/cases/${caseId}#upload-link` },
      ],
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
    counts: {
      docsPresent,
      docsMissing: agg.missing.length,
      pruefbereit,
      warnings,
      criticals: criticals.length,
      docsFehler,
      docsLaufend,
      offeneBefunde,
      machbarkeitBlockiert,
    },
    missingCustomerFields,
    machbarkeit: machbarkeitUrteil,
    selbstauskunft,
    anforderungsAbgleich: agg.anforderungsAbgleich,
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
