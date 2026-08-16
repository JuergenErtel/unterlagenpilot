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
  // Genau dieselben Relationen wie auf der Fallseite (cases/[id]/page.tsx) und
  // der Review-Seite (review/page.tsx): Die Erstgespraech-Reife (berechneReife)
  // liest fuenf ihrer Je-Person-Angaben – beschaeftigungsart, inProbezeit,
  // befristet, nettoMonatlich, sonstigeEinnahmen – aus den VERSCHACHTELTEN
  // Listen employment/income am Antragsteller. Fehlen sie im Include, sind sie
  // undefined und zaehlen dauerhaft als offen; das Dashboard behauptete dann
  // fuer praktisch jeden Fall "Erstgespraech fuehren" und verdraengte
  // Machbarkeit, Unterlagen, Fristen und Einreichung. Wer hier property und
  // financingRequest ergaenzt, muss employment und income mit ergaenzen.
  const todoCandidates = await prisma.case.findMany({
    where: activeWhere,
    include: {
      applicants: {
        orderBy: { position: "asc" },
        include: {
          employment: { orderBy: { createdAt: "asc" } },
          income: { orderBy: { createdAt: "asc" } },
        },
      },
      property: true,
      financingRequest: true,
      // Kontaktstand (Aufgabe 7): dieselbe Herleitung wie auf der Fallseite –
      // nur Vermerke MIT Ergebnis (Kontaktversuche) zählen, aeltere zuerst
      // egal, hier absteigend geladen, weil kontaktStand nur den spaetesten
      // braucht.
      caseNotes: {
        where: { ergebnis: { not: null } },
        select: { ergebnis: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      // Telefonnummer fuer den Anruf-Hinweis: erst der erste Antragsteller
      // (bereits oben geladen), sonst die Kundennummer als Rueckfalloption.
      customer: { select: { phone: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 12,
  });

  // Dokument-Status für alle Kandidaten in EINER Query – speist die
  // Next-Step-Engine (gleiche Prioritätsleiter wie auf der Fallseite).
  const todoDocs = await prisma.document.findMany({
    where: { caseId: { in: todoCandidates.map((c) => c.id) } },
    // `updatedAt` gehört dazu: An ihm allein hängt das Alter eines laufenden
    // Dokuments (countRunningClassifications) – der Fallstatus sagt beim
    // normalen Upload nichts darüber. Dieselbe Auswahl wie im Cockpit.
    select: {
      caseId: true,
      reviewStatus: true,
      classificationStatus: true,
      extractionStatus: true,
      updatedAt: true,
    },
  });

  // Selbstauskunft je Kandidat – EINE Batch-Query (dieselbe Quelle wie die
  // Fallseite, siehe selbstauskunft-stand.ts), damit das Dashboard denselben
  // Stand sieht: Der Erstkontakt legt schon einen `SelfDisclosureLink` an,
  // bevor der Kunde den Bogen je öffnet – ein `SelfDisclosure`-Datensatz
  // entsteht erst danach. Wer nur nach Letzterem sucht, übersieht genau die
  // Fälle, bei denen ein gültiger Link unbearbeitet beim Kunden liegt.
  const selbstauskunftJeFall = await ladeSelbstauskunftStandBatch(todoCandidates.map((c) => c.id));

  // Erstkontakt-Stand je Kandidat – ebenfalls in EINER Query, damit das
  // Dashboard dieselbe Prioritätsleiter sieht wie die Fallseite (next-step.ts).
  // Offene Detektiv-Befunde je Kandidat – EINE groupBy statt einer Abfrage je
  // Fall, sonst kostet die Dashboard-Liste zwölf zusätzliche Datenbankrunden.
  const befundeJeFall = new Map(
    (
      await prisma.caseFinding.groupBy({
        by: ["caseId"],
        where: { caseId: { in: todoCandidates.map((c) => c.id) }, status: { in: ["offen", "unsicher"] } },
        _count: { _all: true },
      })
    ).map((r) => [r.caseId, r._count._all])
  );

  const erstkontaktNachrichten = await prisma.generatedMessage.findMany({
    where: { id: { in: todoCandidates.map((c) => c.erstkontaktMessageId).filter((mid): mid is string => !!mid) } },
    select: { id: true, sent: true },
  });
  const versendetJeNachricht = new Map(erstkontaktNachrichten.map((m) => [m.id, m.sent]));

  // EINMAL je Aufruf gebildet, nicht je Fall: `kontaktStand` vergleicht gegen
  // "jetzt" – zwei Fälle desselben Aufrufs müssen denselben Zeitpunkt sehen,
  // sonst werden Grenzfälle (Abstand/Frist gerade abgelaufen) unerklärlich.
  const jetzt = new Date();
  const kontaktEinstellungenWert = kontaktEinstellungen();
  // Stichtag ebenfalls EINMAL je Aufruf (siehe kontakt.ts): Bestandsfaelle von
  // vor der Einfuehrung bekommen gar keinen Kontaktstand.
  const kontaktStartAbWert = kontaktStartAb();

  const enriched = await Promise.all(
    todoCandidates.map(async (c) => {
      const agg = await getCaseAggregate(c.id);
      const platformReady = readyByCase.get(c.id) ?? { europace: false, finlink: false, ehyp_home: false };
      const name =
        c.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(" & ") ||
        "Ohne Namen";
      const docs = todoDocs.filter((d) => d.caseId === c.id);
      /*
       * Reife des Erstgespraechs fuer die Fallreise (next-step.ts). Dieselbe
       * Zaehlung wie die Maske selbst (erstgespraech/page.tsx): Antragstellerzahl
       * aus den vorhandenen Antragstellern, geklemmt auf 1..MAX_APPLICANTS. Ohne
       * diese Angleichung nennte das Dashboard eine andere Zahl offener Angaben
       * als die Fallseite, die der Vermittler als naechstes oeffnet.
       */
      const erstgespraechStand: Fallstand = {
        applicants: c.applicants as unknown as Fallstand["applicants"],
        property: (c.property as Record<string, unknown> | null) ?? null,
        financingRequest: (c.financingRequest as Record<string, unknown> | null) ?? null,
        caseFelder: { financingType: c.financingType ?? null },
      };
      const erstgespraechAntragstellerZahl = Math.min(
        Math.max(c.applicants.length, 1),
        MAX_APPLICANTS
      ) as 1 | 2;
      const erstgespraechReife = berechneReife(erstgespraechStand, erstgespraechAntragstellerZahl);
      // Nur FRISCH laufende Klassifikationen zählen (documents/processing.ts) –
      // dieselbe Zählung wie im Cockpit, damit Dashboard und Fallseite
      // denselben Schritt nennen.
      const docsLaufend = countRunningClassifications(docs);
      // Kontaktstand: fertig gerechnet hereingegeben, damit next-step.ts ohne
      // eigene Uhr auskommt (dieselbe Herleitung wie auf der Fallseite).
      // Vor dem Stichtag bleibt er `null` – der Fall verhaelt sich dann exakt
      // wie vor der Einfuehrung der Kontaktaufnahme (siehe kontakt.ts).
      const stand = giltKontaktaufnahmeFuer(c.createdAt, kontaktStartAbWert)
        ? kontaktStand(
            c.caseNotes.map((n) => ({ ergebnis: n.ergebnis!, createdAt: n.createdAt })),
            c.createdAt,
            jetzt,
            kontaktEinstellungenWert
          )
        : null;
      let step = computeNextStep({
        caseId: c.id,
        status: c.status,
        leadPhase: c.leadPhase,
        counts: {
          pruefbereit: docs.filter((d) => d.reviewStatus === "offen" && d.classificationStatus === "fertig").length,
          docsMissing: agg.missing.length,
          criticals: agg.plausibility.filter((p) => p.status === "kritisch").length,
          docsFehler: countDocumentsWithoutAiResult(docs),
          docsLaufend,
          offeneBefunde: befundeJeFall.get(c.id) ?? 0,
          // Bewusst false: der Solver braucht je Fall einen vollstaendigen
          // caseToCanonical-Lauf. Zwoelf davon wuerden die Dashboard-Liste
          // spuerbar verlangsamen, und die Warnung steht ohnehin auf der
          // Fallseite. Kein Versehen.
          machbarkeitBlockiert: false,
        },
        missingCustomerFields: c.applicants
          .filter((a) => !a.geburtsdatum)
          .map((a) => `Geburtsdatum ${a.vorname ?? `Antragsteller ${a.position}`}`),
        selbstauskunft: (() => {
          const s = selbstauskunftJeFall.get(c.id);
          if (!s?.linkId) return undefined;
          return { eingegangen: s.eingegangen, begonnen: s.begonnen, erstelltVorTagen: s.erstelltVorTagen };
        })(),
        erstkontakt: {
          empfaenger: c.applicants.map((a) => a.email).find((e): e is string => !!e && e.includes("@")) ?? null,
          vorbereitet: Boolean(c.erstkontaktMessageId),
          versendet: c.erstkontaktMessageId ? (versendetJeNachricht.get(c.erstkontaktMessageId) ?? false) : false,
        },
        erstgespraech: {
          offeneAngaben: erstgespraechReife.gesamt - erstgespraechReife.gefuellt,
          gefuehrtAm: c.erstgespraechGefuehrtAm,
        },
        kontakt: stand
          ? { stand, telefon: c.applicants[0]?.phone ?? c.customer?.phone ?? null }
          : undefined,
        wiedervorlageFaellig: c.wiedervorlage != null && c.wiedervorlage <= jetzt,
        verloren: c.verlorenAm != null,
      });
      // Stale-Schutz: dieselbe Regel wie auf der Fallseite (ai-check-status.ts).
      // Ohne ihn bliebe ein Fall mit hart gestorbenem Hintergrundlauf hier für
      // immer bei "KI-Auswertung läuft" stehen, während die Fallseite (die der
      // Vermittler als nächstes öffnet) schon "unterbrochen" zeigt – derselbe
      // Fall, zwei Aussagen. `isAnyAiCheckRunning` (nicht `isAiCheckRunning`)
      // erkennt auch den Einzel-Upload, der den Fallstatus nie anfasst.
      step = withAiCheckStaleOverride(
        step,
        isAnyAiCheckRunning(c.status, c.updatedAt, docsLaufend)
      );
      const blockers = (Object.keys(platformReady) as Platform[]).filter((p) => !platformReady[p] && p !== "finlink");
      return { c, agg, name, step, blockers };
    })
  );

  /*
   * Faellige Kontaktschritte stehen oben: Ein frischer Lead hat naturgemaess
   * einen niedrigen Reifegrad, aber genau deshalb wuerde er in einer reinen
   * Reifegrad-Sortierung neben halbfertigen Faellen untergehen. Der Anruf ist
   * das Zeitkritische – alles andere kann auch morgen noch.
   *
   * Im Blick behalten: Die Liste bleibt bei sechs Eintraegen gedeckelt.
   * Kommen an einem Tag mehr als sechs frische Leads herein, verdraengen die
   * Anrufe alles andere. Das ist fuer den Moment richtig – falls es stoert,
   * ist der Deckel die Stellschraube, nicht die Sortierung.
   */
  // Als Set der ECHTEN Schluessel typisiert, nicht als Set<string>: Der
  // frueher hier mitgefuehrte "kontakt_aufgeben" existierte laengst nicht mehr
  // (der Abbruch ist seit der Nachbesserung nur ein Hinweis in `wartet`), und
  // `tsc` schwieg dazu, weil jede Zeichenkette passte.
  const KONTAKT_SCHRITTE = new Set<NextStep["key"]>(["kontakt_aufnehmen"]);
  const rang = (e: (typeof enriched)[number]) => (KONTAKT_SCHRITTE.has(e.step.key) ? 0 : 1);

  // To-dos priorisiert (Kontaktschritte zuerst, danach niedrigster Score / meiste Lücken zuerst)
  const todos: TodoCase[] = enriched
    .sort((a, b) => rang(a) - rang(b) || a.agg.readiness.score - b.agg.readiness.score)
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

