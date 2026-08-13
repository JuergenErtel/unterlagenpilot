import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { acceptDocument } from "@/lib/actions/cases";
import { getCaseCockpit } from "@/lib/cases/cockpit";
import { computeNextStep } from "@/lib/cases/next-step";
import { isAiCheckRunning, withAiCheckStaleOverride } from "@/lib/cases/ai-check-status";
import { berechneReife } from "@/lib/erstgespraech/reife";
import type { Fallstand } from "@/lib/self-disclosure/takeover";
import { ladeErstkontaktStand } from "@/lib/actions/erstkontakt-actions";
import { NextStepCard } from "@/components/case/next-step-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/ui/page-header";
import { SeverityBadge } from "@/components/status-badge";
import { ConfidenceBadge } from "@/components/case/confidence-badge";
import { ExtractedFieldActions } from "@/components/review/extracted-field-actions";
import { DocumentTypeSelect } from "@/components/review/document-type-select";
import { ApplicantSelect } from "@/components/review/applicant-select";
import { RejectDocumentButton } from "@/components/review/reject-document-button";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatConfidence } from "@/lib/utils";
import {
  MAX_APPLICANTS,
  type DocumentType,
  type Severity,
} from "@/lib/domain/enums";

export default async function ReviewCenterPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const ctx = await requireContext();
  const { case: caseId } = await searchParams;

  const documents = await prisma.document.findMany({
    where: {
      case: { organizationId: ctx.organizationId },
      caseId: caseId || undefined,
      reviewStatus: "offen",
      classificationStatus: "fertig",
    },
    include: { extractedFields: true, warnings: true, case: { include: { applicants: true } } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  // Geführter Modus: aus einem Fall heraus geöffnet („Nächster Schritt“-Karte).
  const caseScope = caseId
    ? await prisma.case.findFirst({
        where: { id: caseId, organizationId: ctx.organizationId },
        select: {
          id: true,
          caseNumber: true,
          financingType: true,
          status: true,
          updatedAt: true,
          applicants: {
            orderBy: { position: "asc" },
            include: {
              employment: { orderBy: { createdAt: "asc" } },
              income: { orderBy: { createdAt: "asc" } },
            },
          },
          property: true,
          financingRequest: true,
        },
      })
    : null;

  // Abschluss des geführten Modus: nichts mehr offen → nächster Schritt des Falls.
  // Derselbe Aufruf wie auf der Fallseite (inkl. Erstkontakt- und
  // Erstgespräch-Stand), sonst widerspräche sich die Leiter zwischen
  // Review-Abschluss und Fallseite.
  const completion =
    caseScope && documents.length === 0
      ? await (async () => {
          const [cockpit, erstkontaktStand] = await Promise.all([
            getCaseCockpit(caseScope.id),
            ladeErstkontaktStand(caseScope.id),
          ]);
          // Dieselbe Zaehlung wie die Maske selbst (erstgespraech/page.tsx):
          // Antragstellerzahl aus den vorhandenen Antragstellern, geklemmt auf
          // 1..MAX_APPLICANTS.
          const stand: Fallstand = {
            applicants: caseScope.applicants as unknown as Fallstand["applicants"],
            property: (caseScope.property as Record<string, unknown> | null) ?? null,
            financingRequest: (caseScope.financingRequest as Record<string, unknown> | null) ?? null,
            caseFelder: { financingType: caseScope.financingType ?? null },
          };
          const antragstellerZahl = Math.min(
            Math.max(caseScope.applicants.length, 1),
            MAX_APPLICANTS
          ) as 1 | 2;
          const reife = berechneReife(stand, antragstellerZahl);
          let step = computeNextStep({
            ...cockpit,
            erstkontakt: {
              empfaenger: erstkontaktStand.empfaenger,
              vorbereitet: Boolean(erstkontaktStand.messageId),
              versendet: erstkontaktStand.versendet,
            },
            erstgespraech: { offeneAngaben: reife.gesamt - reife.gefuellt },
          });
          // Stale-Schutz: dieselbe Regel wie Fallseite und Dashboard
          // (ai-check-status.ts). Ohne ihn bliebe der Review-Abschluss für
          // einen hart gestorbenen Hintergrundlauf für immer bei
          // "KI-Auswertung läuft" stehen.
          const aiCheckRunning = isAiCheckRunning(caseScope.status, caseScope.updatedAt);
          step = withAiCheckStaleOverride(step, aiCheckRunning);
          return { cockpit, step, aiCheckRunning };
        })()
      : null;

  return (
    <div className="space-y-6">
      {caseScope && (
        <Link
          href={`/cases/${caseScope.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zum Fall {caseScope.caseNumber}
        </Link>
      )}
      <PageHeader
        eyebrow="KI-Auswertung"
        title={caseScope ? `Dokumente freigeben · ${caseScope.caseNumber}` : "Review-Center"}
        subtitle={
          caseScope
            ? documents.length > 0
              ? `Noch ${documents.length} Dokument${documents.length === 1 ? "" : "e"} zu prüfen. Übernimm die erkannten Daten mit einem Klick – oder korrigiere einzelne Felder.`
              : "Alle Dokumente dieses Falls sind freigegeben."
            : "Links die Vorschau, in der Mitte die erkannten Daten, rechts Hinweise. Prüfe, korrigiere und gib frei – jede Aktion wird im Audit-Log protokolliert."
        }
      />

      {completion ? (
        <div className="space-y-4">
          {/* Läuft gerade eine KI-Prüfung, sind die Dokumente nur vorübergehend
              aus der Liste verschwunden ("laeuft" statt "fertig") – dann wäre
              "Alles freigegeben" irreführend. Dieselbe Grundlage (aiCheckRunning)
              wie die NextStepCard darunter: stirbt der Lauf hart (stale), sagt
              hier nicht "läuft gerade", während die Karte "unterbrochen" zeigt. */}
          {completion.cockpit.counts.docsLaufend > 0 && completion.aiCheckRunning ? (
            <Card className="border-ai/30 bg-ai/5">
              <CardContent className="flex items-center gap-3 p-6">
                <Sparkles className="h-8 w-8 shrink-0 text-ai" />
                <div>
                  <p className="font-medium">KI-Prüfung läuft gerade</p>
                  <p className="text-sm text-muted-foreground">
                    {completion.cockpit.counts.docsLaufend} Dokument
                    {completion.cockpit.counts.docsLaufend === 1 ? " wird" : "e werden"} gerade neu
                    ausgewertet – sie erscheinen danach wieder hier zur Freigabe. Bereits erteilte
                    Freigaben bleiben erhalten.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-success/30 bg-success/5">
              <CardContent className="flex items-center gap-3 p-6">
                <CheckCircle2 className="h-8 w-8 shrink-0 text-success" />
                <div>
                  <p className="font-medium">Alles freigegeben – gut gemacht!</p>
                  <p className="text-sm text-muted-foreground">
                    Die übernommenen Daten stehen jetzt in der Fallakte
                    {completion.cockpit.counts.docsFehler > 0
                      ? ` – ${completion.cockpit.counts.docsFehler} Dokument${completion.cockpit.counts.docsFehler === 1 ? "" : "e"} ohne KI-Ergebnis wartet${completion.cockpit.counts.docsFehler === 1 ? "" : "en"} noch auf eine wiederholte KI-Prüfung.`
                      : "."}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          <NextStepCard step={completion.step} />
        </div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-ai" />
            <p className="text-sm font-medium">Aktuell ist nichts offen.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Sobald ein Kunde neue Unterlagen hochlädt, klassifiziert die KI sie automatisch und sie erscheinen hier zur Prüfung.
            </p>
          </CardContent>
        </Card>
      ) : (
        documents.map((d, docIndex) => {
          const name = d.case.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).filter(Boolean).join(" & ");
          // Bei mehreren Antragstellern muss der Vermittler zuordnen können: der
          // gemeinsame Kunden-Upload-Link verrät nicht, wessen Unterlage das ist.
          const applicantOptions = [...d.case.applicants]
            .sort((a, b) => a.position - b.position)
            .map((a) => ({
              id: a.id,
              name: [a.vorname, a.nachname].filter(Boolean).join(" ") || `Antragsteller ${a.position}`,
            }));
          return (
            <Card key={d.id} className="overflow-hidden">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b bg-muted/30">
                <div className="flex flex-wrap items-center gap-2">
                  {caseScope && (
                    <Badge variant="ai" className="font-mono tabular">
                      {docIndex + 1} von {documents.length}
                    </Badge>
                  )}
                  <CardTitle className="text-base">{d.generatedName ?? d.originalName}</CardTitle>
                  <DocumentTypeSelect documentId={d.id} value={d.documentType as DocumentType | null} />
                  {applicantOptions.length > 1 && (
                    <ApplicantSelect documentId={d.id} value={d.applicantId} source={d.applicantSource} applicants={applicantOptions} />
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Link href={`/review?case=${d.caseId}`} className="hover:text-foreground hover:underline">
                    {d.case.caseNumber} · {name}
                  </Link>
                  <Badge variant="neutral" className="font-mono tabular">Konfidenz {formatConfidence(d.confidence)}</Badge>
                  {/*
                    Die Hauptaktion gehoert an den Kopf des Dokuments. Unterhalb
                    von lg stapeln sich die drei Spalten der Karte, und die
                    Aktionsspalte ist die dritte: Bei einem Expose mit ~37
                    erkannten Feldern lag der Freigabe-Knopf rund zwei
                    Bildschirmhoehen unter dem Kartenkopf und war schlicht nicht
                    auffindbar. Hier steht er immer im Blick, bei jeder Breite.
                  */}
                  <form action={acceptDocument.bind(null, d.id)}>
                    <SubmitButton size="sm" pendingLabel="Wird übernommen …">
                      Freigeben
                    </SubmitButton>
                  </form>
                </div>
              </CardHeader>
              <CardContent className="grid gap-0 p-0 lg:grid-cols-[1fr_1.3fr_1fr]">
                {/* Vorschau */}
                <div className="flex flex-col items-center justify-center gap-2 border-b bg-gradient-to-br from-muted/40 to-card p-4 text-center lg:border-b-0 lg:border-r">
                  {d.mimeType?.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/documents/${d.id}/download?preview=1`}
                      alt={`Vorschau: ${d.generatedName ?? d.originalName}`}
                      className="max-h-72 w-auto max-w-full rounded-md border object-contain"
                    />
                  ) : d.mimeType === "application/pdf" ? (
                    <iframe
                      src={`/api/documents/${d.id}/download?preview=1`}
                      title={`Vorschau: ${d.generatedName ?? d.originalName}`}
                      className="h-72 w-full rounded-md border bg-card"
                    />
                  ) : (
                    <div className="flex h-32 w-24 items-center justify-center rounded-md border-2 border-dashed bg-card">
                      <FileText className="h-8 w-8 text-muted-foreground/60" />
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs">
                    <a
                      href={`/api/documents/${d.id}/download?preview=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Original öffnen
                    </a>
                    <Link href={`/cases/${d.caseId}`} className="text-primary underline">Zur Fallakte</Link>
                  </div>
                </div>

                {/* Erkannte Felder */}
                <div className="space-y-1 border-b p-4 lg:border-b-0 lg:border-r">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Erkannte Felder</div>
                  {d.extractedFields.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">{f.label}</div>
                        <div className="truncate text-sm font-medium">{f.correctedValue ?? f.value ?? "—"}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <ConfidenceBadge value={f.confidence} />
                        <ExtractedFieldActions
                          fieldId={f.id}
                          currentValue={f.correctedValue ?? f.value}
                          reviewed={f.reviewed}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Hinweise + Aktionen */}
                <div className="space-y-3 p-4">
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" /> Hinweise
                    </div>
                    <div className="space-y-1.5">
                      {d.warnings.length === 0 && <p className="text-xs text-muted-foreground">Keine Auffälligkeiten.</p>}
                      {d.warnings.map((w) => (
                        <div key={w.id} className="flex items-start gap-2 text-xs">
                          <SeverityBadge severity={w.severity as Severity} />
                          <span className="text-muted-foreground">{w.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-1.5">
                    <form action={acceptDocument.bind(null, d.id)}>
                      {/* Tinte, nicht Gruen: Gruen ist in dieser App ein
                          Zustand ("angenommen"), keine Aktion. Die eine
                          Hauptaktion je Bildschirm traegt immer die Tinte. */}
                      <SubmitButton size="sm" className="w-full" pendingLabel="Wird übernommen …">
                        {caseScope ? "Alle Felder übernehmen & Dokument freigeben" : "Dokument akzeptieren"}
                      </SubmitButton>
                    </form>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button asChild size="sm" variant="outline"><Link href={`/cases/${d.caseId}/messages`}>Nachfordern</Link></Button>
                      <RejectDocumentButton documentId={d.id} />
                    </div>
                    {/*
                      Früher standen hier drei "Für Plattform freigeben"-Buttons. Sie gaben
                      den GANZEN FALL frei (nicht das Dokument), umgingen den Pflichtfeld-Guard
                      der Export-Seite und revalidierten nur /export – im Review-Center passierte
                      sichtbar nichts. Die Freigabe gehört in den Einreichungsassistenten.
                    */}
                    <Button asChild size="sm" variant="ghost" className="w-full text-[11px]">
                      <Link href={`/cases/${d.caseId}/export`}>Zum Einreichungsassistenten →</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
