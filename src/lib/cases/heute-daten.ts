/**
 * Lädt die Rohdaten für die Heute-Liste und reicht sie an `ordneAufgaben`.
 *
 * Die Fallschleife hier ist die aus dem Dashboard – sie ist mit dieser Liste
 * dorthin UMGEZOGEN, nicht kopiert. Zwei Stellen, die denselben nächsten
 * Schritt rechnen, laufen in diesem Haus zuverlässig auseinander: Genau so
 * mahnte die Kanban-Karte noch „Erstgespräch führen", als die Leiter längst
 * schwieg.
 *
 * Kosten: `getCaseAggregate` läuft je Fall. Deshalb der Deckel `MAX_FAELLE` –
 * er begrenzt die Abfragen, nicht die Anzeige. Wird er erreicht, sagt die
 * Seite es (siehe `abgeschnitten`), statt stillschweigend die Hälfte der
 * Arbeit zu verschweigen.
 */

import { prisma } from "@/lib/db";
import { getCaseAggregate } from "./service";
import { computeNextStep } from "@/lib/cases/next-step";
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
import { MAX_APPLICANTS, type CaseStatus } from "@/lib/domain/enums";
import { ordneAufgaben, SCHRITT_LABEL, type AufgabeRoh, type HeuteAufgabe } from "@/lib/cases/heute";
import type { NextStep } from "@/lib/cases/next-step";

/** Terminale Status – dort ist nichts mehr zu tun. */
const TERMINAL_STATUSES: CaseStatus[] = ["abgeschlossen", "archiviert"];

/**
 * Wie viele aktive Fälle höchstens durchgerechnet werden.
 *
 * Bei Jürgens Bestand (rund 15 aktive Fälle) greift der Deckel nie. Er steht
 * hier, damit die Seite bei 300 Fällen nicht 300 Aggregate lädt und in einen
 * Zeitüberlauf läuft.
 */
const MAX_FAELLE = 60;

export interface HeuteDaten {
  aufgaben: HeuteAufgabe[];
  /** Heute schon abgehakt – für die Rückgängig-Zeile am Seitenende. */
  erledigt: Array<{
    caseId: string;
    caseNumber: string;
    name: string;
    schritt: string;
    titel: string;
    erledigtAm: Date;
  }>;
  /** Mehr aktive Fälle als der Deckel zulässt – die Seite muss es sagen. */
  abgeschnitten: number;
}

export async function ladeHeute(organizationId: string): Promise<HeuteDaten> {
  const activeWhere = { organizationId, status: { notIn: TERMINAL_STATUSES } };

  const [aktiveGesamt, kandidaten] = await Promise.all([
    prisma.case.count({ where: activeWhere }),
    prisma.case.findMany({
      where: activeWhere,
      include: {
        /*
         * Dieselben Relationen wie auf der Fallseite. `berechneReife` liest
         * fünf Je-Person-Angaben – beschaeftigungsart, inProbezeit, befristet,
         * nettoMonatlich, sonstigeEinnahmen – aus den VERSCHACHTELTEN Listen
         * employment/income. Fehlen sie hier, sind sie undefined und zählen
         * dauerhaft als offen; die Liste behauptete dann für praktisch jeden
         * Fall „Erstgespräch führen". Wer property/financingRequest ergänzt,
         * muss employment und income mitnehmen.
         */
        applicants: {
          orderBy: { position: "asc" },
          include: {
            employment: { orderBy: { createdAt: "asc" } },
            income: { orderBy: { createdAt: "asc" } },
          },
        },
        property: true,
        financingRequest: true,
        // Nur Vermerke MIT Ergebnis sind Kontaktversuche; `kontaktStand`
        // braucht davon nur den spätesten.
        caseNotes: {
          where: { ergebnis: { not: null } },
          select: { ergebnis: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
        customer: { select: { phone: true } },
        // Termine am Fall – sie stellen die Dringlichkeit, die Leiter kennt
        // keine Daten.
        deadlines: {
          where: { done: false },
          orderBy: { dueDate: "asc" },
          take: 1,
          select: { title: true, dueDate: true },
        },
        _count: { select: { missingRequests: { where: { requestSource: "bank", resolved: false } } } },
        erledigteAufgaben: { select: { schritt: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_FAELLE,
    }),
  ]);

  const ids = kandidaten.map((c) => c.id);

  const [docs, selbstauskunftJeFall, befundeRows, erstkontaktNachrichten] = await Promise.all([
    prisma.document.findMany({
      where: { caseId: { in: ids } },
      select: {
        caseId: true,
        reviewStatus: true,
        classificationStatus: true,
        extractionStatus: true,
        updatedAt: true,
      },
    }),
    ladeSelbstauskunftStandBatch(ids),
    prisma.caseFinding.groupBy({
      by: ["caseId"],
      where: { caseId: { in: ids }, status: { in: ["offen", "unsicher"] } },
      _count: { _all: true },
    }),
    prisma.generatedMessage.findMany({
      where: {
        id: { in: kandidaten.map((c) => c.erstkontaktMessageId).filter((m): m is string => !!m) },
      },
      select: { id: true, sent: true },
    }),
  ]);

  const befundeJeFall = new Map(befundeRows.map((r) => [r.caseId, r._count._all]));
  const versendetJeNachricht = new Map(erstkontaktNachrichten.map((m) => [m.id, m.sent]));

  // EINMAL je Aufruf, nicht je Fall: Zwei Fälle desselben Aufrufs müssen
  // denselben Zeitpunkt sehen, sonst werden Grenzfälle unerklärlich.
  const jetzt = new Date();
  const kontaktEinstellungenWert = kontaktEinstellungen();
  const kontaktStartAbWert = kontaktStartAb();

  const roh: AufgabeRoh[] = await Promise.all(
    kandidaten.map(async (c) => {
      const agg = await getCaseAggregate(c.id);
      const eigeneDocs = docs.filter((d) => d.caseId === c.id);
      const name =
        c.applicants
          .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" "))
          .filter(Boolean)
          .join(" & ") || "Ohne Namen";

      const erstgespraechStand: Fallstand = {
        applicants: c.applicants as unknown as Fallstand["applicants"],
        property: (c.property as Record<string, unknown> | null) ?? null,
        financingRequest: (c.financingRequest as Record<string, unknown> | null) ?? null,
        caseFelder: { financingType: c.financingType ?? null },
      };
      const antragstellerZahl = Math.min(Math.max(c.applicants.length, 1), MAX_APPLICANTS) as 1 | 2;
      const reife = berechneReife(erstgespraechStand, antragstellerZahl);

      const docsLaufend = countRunningClassifications(eigeneDocs);
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
          pruefbereit: eigeneDocs.filter(
            (d) => d.reviewStatus === "offen" && d.classificationStatus === "fertig"
          ).length,
          docsMissing: agg.missing.length,
          criticals: agg.plausibility.filter((p) => p.status === "kritisch").length,
          docsFehler: countDocumentsWithoutAiResult(eigeneDocs),
          docsLaufend,
          offeneBefunde: befundeJeFall.get(c.id) ?? 0,
          // Wie im Dashboard bewusst false: Der Solver braucht je Fall einen
          // vollständigen caseToCanonical-Lauf, und die Warnung steht ohnehin
          // auf der Fallseite.
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
          empfaenger:
            c.applicants.map((a) => a.email).find((e): e is string => !!e && e.includes("@")) ?? null,
          vorbereitet: Boolean(c.erstkontaktMessageId),
          versendet: c.erstkontaktMessageId
            ? (versendetJeNachricht.get(c.erstkontaktMessageId) ?? false)
            : false,
        },
        erstgespraech: { offeneAngaben: reife.gesamt - reife.gefuellt, gefuehrtAm: c.erstgespraechGefuehrtAm },
        kontakt: stand
          ? { stand, telefon: c.applicants[0]?.phone ?? c.customer?.phone ?? null }
          : undefined,
        wiedervorlageFaellig: c.wiedervorlage != null && c.wiedervorlage <= jetzt,
        verloren: c.verlorenAm != null,
      });
      step = withAiCheckStaleOverride(step, isAnyAiCheckRunning(c.status, c.updatedAt, docsLaufend));

      const abgehakt = new Set(c.erledigteAufgaben.map((e) => e.schritt));

      return {
        caseId: c.id,
        caseNumber: c.caseNumber,
        name,
        step,
        readiness: agg.readiness.score,
        angelegtAm: c.createdAt,
        wiedervorlage: c.wiedervorlage,
        naechsteFrist: c.deadlines[0] ?? null,
        offeneBankforderungen: c._count.missingRequests,
        telefon: c.applicants[0]?.phone ?? c.customer?.phone ?? null,
        bereitsAbgehakt: abgehakt.has(step.key),
      } satisfies AufgabeRoh;
    })
  );

  // Was in den letzten 24 Stunden abgehakt wurde – nur für die
  // Rückgängig-Zeile. Bewusst kurz gefasst: Sie soll den Fehlklick von eben
  // auffangen, kein Archiv sein.
  const erledigtRows = await prisma.aufgabeErledigt.findMany({
    where: {
      case: { organizationId },
      erledigtAm: { gte: new Date(jetzt.getTime() - 24 * 3600_000) },
    },
    orderBy: { erledigtAm: "desc" },
    select: {
      schritt: true,
      erledigtAm: true,
      case: {
        select: {
          id: true,
          caseNumber: true,
          applicants: { orderBy: { position: "asc" }, select: { vorname: true, nachname: true } },
        },
      },
    },
  });

  return {
    aufgaben: ordneAufgaben(roh, jetzt),
    erledigt: erledigtRows.map((e) => ({
      caseId: e.case.id,
      caseNumber: e.case.caseNumber,
      name:
        e.case.applicants
          .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" "))
          .filter(Boolean)
          .join(" & ") || "Ohne Namen",
      schritt: e.schritt,
      // Der Schlüssel steht so in der Datenbank; ist er dort unbekannt (alter
      // Vermerk zu einer inzwischen entfernten Sprosse), zeigen wir ihn roh
      // statt die Zeile wegzulassen – rückgängig machen muss immer gehen.
      titel: SCHRITT_LABEL[e.schritt as NextStep["key"]] ?? e.schritt,
      erledigtAm: e.erledigtAm,
    })),
    abgeschnitten: Math.max(0, aktiveGesamt - kandidaten.length),
  };
}
