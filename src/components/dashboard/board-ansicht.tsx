import Link from "next/link";
import { BadgeEuro, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { buildPipeline, type PipelineCaseInput } from "@/lib/cases/pipeline";
import { buildBoard, liegezeitTage, type BoardKarte } from "@/lib/cases/lead-board";
import { schlagePhaseVor } from "@/lib/cases/lead-phase";
import { laeuftAusserhalb } from "@/lib/cases/next-step";
import { ampelFuer } from "@/lib/machbarkeit/ampel";
import { ladeAnnahmen } from "@/lib/machbarkeit/annahmen";
import { LeadBoard } from "@/components/pipeline/lead-board";
import { SyncStatus } from "@/components/pipeline/sync-status";
import { LEAD_SOURCE_LABELS, type LeadSource, type CaseStatus } from "@/lib/domain/enums";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CaseStatusBadge } from "@/components/status-badge";

function eur(n: number | null): string {
  return n == null ? "—" : `${Math.round(n).toLocaleString("de-DE")} €`;
}
function dateStr(d: Date | null): string {
  return d ? d.toLocaleDateString("de-DE") : "—";
}

/**
 * Die Vertriebssicht der Arbeitszentrale: das Kanban der Leadphasen, darunter
 * Courtage-Kennzahlen und die Abschlusstabelle.
 *
 * Stand bis zum 12.08.2026 unter eigener Adresse /pipeline. Zusammengelegt,
 * weil die Pipeline der Einstieg in den Arbeitstag ist und nicht ein
 * Nebenschauplatz, den man erst im Menü suchen muss.
 */
export async function BoardAnsicht({ organizationId }: { organizationId: string }) {
  // Fälle, die schon bepreist sind (Darlehensbetrag ODER Courtage gesetzt) bzw. abgeschlossen.
  const rows = await prisma.case.findMany({
    where: {
      organizationId,
      status: { not: "archiviert" },
      OR: [{ darlehensbetrag: { not: null } }, { courtageProzent: { not: null } }, { status: "abgeschlossen" }],
    },
    select: {
      id: true,
      caseNumber: true,
      status: true,
      abschlussBank: true,
      bankName: true,
      darlehensbetrag: true,
      courtageProzent: true,
      abschlussdatum: true,
      applicants: { orderBy: { position: "asc" }, select: { vorname: true, nachname: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const input: PipelineCaseInput[] = rows.map((c) => ({
    caseId: c.id,
    caseNumber: c.caseNumber,
    kundenName:
      c.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(" & ") ||
      "Ohne Namen",
    status: c.status,
    abschlussBank: c.abschlussBank ?? c.bankName,
    darlehensbetrag: c.darlehensbetrag,
    courtageProzent: c.courtageProzent,
    abschlussdatum: c.abschlussdatum,
  }));
  const pipeline = buildPipeline(input);

  // Kanban: eigene Abfrage, weil die Courtage-Liste bewusst nur bepreiste Fälle
  // zeigt – im Board sollen aber ALLE nicht archivierten Fälle stehen.
  const boardRows = await prisma.case.findMany({
    where: { organizationId, status: { not: "archiviert" } },
    select: {
      id: true,
      caseNumber: true,
      status: true,
      leadPhase: true,
      leadPhaseSeit: true,
      wiedervorlage: true,
      verlorenAm: true,
      verlorenGrund: true,
      abschlussdatum: true,
      darlehensbetrag: true,
      quelle: true,
      erstgespraechGefuehrtAm: true,
      // Die folgenden Relationen speisen die Machbarkeits-Ampel. Sie haengen
      // bewusst an DIESER Abfrage: ein caseToCanonical je Karte waere eine
      // Datenbankrunde pro Fall – genau deshalb rechnet das Dashboard den
      // Solver nicht.
      financingType: true,
      applicants: {
        orderBy: { position: "asc" },
        select: {
          vorname: true,
          nachname: true,
          anzahlKinder: true,
          income: { select: { nettoMonatlich: true, sonstigeEinnahmen: true } },
        },
      },
      financingRequest: {
        select: {
          darlehenswunsch: true,
          kaufpreis: true,
          baukosten: true,
          modernisierungskosten: true,
          eigenkapital: true,
          nebenkosten: true,
          maklerprovisionProzent: true,
          grunderwerbsteuerProzent: true,
        },
      },
      property: {
        select: {
          // Das Objektmodell heisst zip/city; erst das Canonical-Mapping
          // uebersetzt das nach plz/ort.
          zip: true,
          city: true,
          wohnflaeche: true,
          hausgeldMonatlich: true,
          mieteinnahmenMonatlich: true,
          bundesland: true,
        },
      },
      liabilities: { select: { art: true, restschuld: true, monatlicheRate: true, abzuloesen: true } },
      _count: { select: { documents: true } },
      generatedMessages: { where: { sent: true }, select: { id: true }, take: 1 },
      selfDisclosures: { select: { currentStep: true }, take: 1, orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  // Annahmen EINMAL laden, nicht je Karte.
  const machbarkeitsAnnahmen = await ladeAnnahmen(organizationId);

  const jetzt = new Date();
  const boardKarten: BoardKarte[] = boardRows.map((c) => ({
    caseId: c.id,
    caseNumber: c.caseNumber,
    kundenName:
      c.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(" & ") ||
      "Ohne Namen",
    volumen:
      c.darlehensbetrag ?? c.financingRequest?.darlehenswunsch ?? c.financingRequest?.kaufpreis ?? null,
    quelle: LEAD_SOURCE_LABELS[c.quelle as LeadSource],
    leadPhase: c.leadPhase,
    leadPhaseSeit: c.leadPhaseSeit,
    wiedervorlage: c.wiedervorlage,
    verlorenAm: c.verlorenAm,
    verlorenGrund: c.verlorenGrund,
    ampel: ampelFuer(
      {
        applicants: c.applicants.map((_a, i) => ({ position: i + 1 })),
        employment: [],
        income: c.applicants.flatMap((a) =>
          a.income.map((i) => ({
            applicantPosition: 1,
            nettoMonatlich: i.nettoMonatlich ?? undefined,
            sonstigeEinnahmen: i.sonstigeEinnahmen ?? undefined,
          }))
        ),
        liabilities: c.liabilities.map((l) => ({
          art: l.art ?? undefined,
          restschuld: l.restschuld ?? undefined,
          monatlicheRate: l.monatlicheRate ?? undefined,
          abzuloesen: l.abzuloesen,
        })),
        assets: [],
        property: c.property
          ? {
              plz: c.property.zip ?? undefined,
              ort: c.property.city ?? undefined,
              wohnflaeche: c.property.wohnflaeche ?? undefined,
              hausgeldMonatlich: c.property.hausgeldMonatlich ?? undefined,
              mieteinnahmenMonatlich: c.property.mieteinnahmenMonatlich ?? undefined,
            }
          : undefined,
        financing: {
          kaufpreis: c.financingRequest?.kaufpreis ?? undefined,
          baukosten: c.financingRequest?.baukosten ?? undefined,
          modernisierungskosten: c.financingRequest?.modernisierungskosten ?? undefined,
          eigenkapital: c.financingRequest?.eigenkapital ?? undefined,
          nebenkosten: c.financingRequest?.nebenkosten ?? undefined,
          maklerprovisionProzent: c.financingRequest?.maklerprovisionProzent ?? undefined,
        },
        financingType: c.financingType ?? undefined,
        platformIds: {},
      } as never,
      {
        applicantCount: Math.max(c.applicants.length, 1),
        anzahlKinder: c.applicants[0]?.anzahlKinder ?? 0,
        verloren: c.verlorenAm != null,
        abgeschlossen: c.status === "abgeschlossen",
        grunderwerbsteuerProzentOverride: c.financingRequest?.grunderwerbsteuerProzent ?? null,
        bundeslandOverride: (c.property?.bundesland as never) ?? null,
      },
      machbarkeitsAnnahmen
    ),
    // Die Phase gehoert in diese Regel: Ab dem Finanzierungsvorschlag fuehrt
    // BaufiDesk den Fall nicht mehr (siehe next-step.ts). Ohne sie stand der
    // Knopf "Erstgespraech fuehren" auch auf Karten in "Zusage" – die Karte
    // rechnete dieselbe Frage anders als die Prioritaetsleiter.
    erstgespraechOffen:
      !laeuftAusserhalb(c.leadPhase) &&
      !c.erstgespraechGefuehrtAm &&
      c.generatedMessages.length === 0,
    vorschlag: schlagePhaseVor({
      leadPhase: c.leadPhase,
      verlorenAm: c.verlorenAm,
      status: c.status,
      abschlussdatum: c.abschlussdatum,
      hatGesendeteNachricht: c.generatedMessages.length > 0,
      selbstauskunftBegonnen: Boolean(c.selfDisclosures[0]?.currentStep),
      dokumenteVorhanden: c._count.documents > 0,
    }),
  }));

  const syncState = await prisma.leadSyncState.findUnique({
    where: { organizationId_quelle: { organizationId, quelle: "finlink" } },
    select: { lastRunAt: true, lastCreated: true, lastError: true },
  });
  const zuletzt = syncState?.lastRunAt
    ? `vor ${Math.max(0, Math.round((jetzt.getTime() - syncState.lastRunAt.getTime()) / 60000))} Minuten`
    : "noch nie";

  // Quellen-Zähler über alle nicht verlorenen Karten.
  const quellenZaehler = new Map<string, number>();
  for (const k of boardKarten) {
    if (k.verlorenAm) continue;
    quellenZaehler.set(k.quelle, (quellenZaehler.get(k.quelle) ?? 0) + 1);
  }

  const board = buildBoard(boardKarten, jetzt);
  const alsView = (s: (typeof board.spalten)[number]) => ({
    phase: s.phase,
    titel: s.titel,
    anzahl: s.anzahl,
    summe: s.summe,
    weitere: s.weitere,
    karten: s.karten.map((k) => ({
      caseId: k.caseId,
      caseNumber: k.caseNumber,
      kundenName: k.kundenName,
      volumen: k.volumen,
      quelle: k.quelle,
      leadPhase: k.leadPhase,
      liegezeit: liegezeitTage(k.leadPhaseSeit, jetzt),
      wiedervorlage: k.wiedervorlage ? k.wiedervorlage.toLocaleDateString("de-DE") : null,
      verlorenGrund: k.verlorenGrund,
      vorschlag: k.vorschlag,
      ampel: k.ampel,
      erstgespraechOffen: k.erstgespraechOffen,
    })),
  });

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Leads nach Phase</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {[...quellenZaehler.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([quelle, anzahl]) => (
                <span key={quelle} className="rounded-full border px-2 py-0.5">
                  {quelle} {anzahl}
                </span>
              ))}
          </div>
          <LeadBoard spalten={board.spalten.map(alsView)} verloren={alsView(board.verloren)} />
          <SyncStatus
            zuletzt={zuletzt}
            angelegt={syncState?.lastCreated ?? 0}
            fehler={syncState?.lastError ?? null}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Abgeschlossen" value={pipeline.abgeschlossen.length} icon={BadgeEuro} />
        <MetricCard label="Courtage abgeschlossen" value={eur(pipeline.courtageAbgeschlossen)} tone="ready" icon={BadgeEuro} />
        <MetricCard label="In Pipeline" value={pipeline.offen.length} icon={TrendingUp} />
        <MetricCard label="Courtage Pipeline (erwartet)" value={eur(pipeline.couragePipeline)} tone="ai" icon={TrendingUp} />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Fälle</CardTitle></CardHeader>
        <CardContent>
          {input.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Noch keine Abschlussdaten erfasst. Trage sie im jeweiligen Fall unter „Verwaltung" ein.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fall</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead className="text-right">Darlehen</TableHead>
                  <TableHead className="text-right">Courtage %</TableHead>
                  <TableHead className="text-right">Courtage €</TableHead>
                  <TableHead>Abschluss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...pipeline.abgeschlossen, ...pipeline.offen].map((c) => (
                  <TableRow key={c.caseId}>
                    <TableCell>
                      <Link href={`/cases/${c.caseId}/verwaltung`} className="font-medium hover:underline">
                        {c.kundenName}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{c.caseNumber}</div>
                    </TableCell>
                    <TableCell><CaseStatusBadge status={c.status as CaseStatus} /></TableCell>
                    <TableCell>{c.abschlussBank ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(c.darlehensbetrag)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.courtageProzent != null ? `${c.courtageProzent} %` : "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{eur(c.courtage)}</TableCell>
                    <TableCell>{dateStr(c.abschlussdatum)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
