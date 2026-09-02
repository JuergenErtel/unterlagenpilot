import Link from "next/link";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { requirePortalAuftrag } from "@/lib/backoffice/zugriff";
import { ladeRueckfragen, ladeVerlauf } from "@/lib/backoffice/auftraege";
import { auftragsartLabel, ergebnisseFuer, ERGEBNIS_LABELS, leistungsLabel } from "@/lib/backoffice/leistungen";
import { datumText, datumZeitText } from "@/lib/backoffice/anzeige";
import { getCaseAggregate } from "@/lib/cases/service";
import {
  BACKOFFICE_STATUS_PORTAL_LABELS,
  BACKOFFICE_TERMINAL_STATUS,
  DOCUMENT_TYPE_LABELS,
  isDeliverableScanStatus,
  type BackofficeStatus,
  type DocumentType,
} from "@/lib/domain/enums";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusMarke, StationenLeiste } from "@/components/backoffice/status-anzeigen";
import { PortalUploadForm } from "@/components/portal/portal-upload-form";
import {
  AbnahmeForm,
  FeedbackForm,
  HinweiseForm,
  NachbearbeitungForm,
  RueckfrageAntwortForm,
  UploadLinkForm,
} from "@/components/portal/portal-formulare";
import { ERGEBNIS_ROUTE_TYPE, PORTAL_LEVEL_LABELS, reviewLabel } from "@/components/portal/hilfen";

export const dynamic = "force-dynamic";
// Upload-Actions verarbeiten OCR/KI nach der Antwort weiter (after()).
export const maxDuration = 300;

export default async function PortalAuftragDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, auftrag } = await requirePortalAuftrag(id);
  const status = auftrag.status as BackofficeStatus;
  const terminal = BACKOFFICE_TERMINAL_STATUS.has(status);
  const partner = ctx.auftraggeber.find((a) => a.id === auftrag.auftraggeberId);

  const [aggregat, ungeprueft, dokumente, applicants, rueckfragen, verlauf] = await Promise.all([
    getCaseAggregate(auftrag.caseId).catch(() => null),
    prisma.document.count({ where: { caseId: auftrag.caseId, reviewStatus: "offen" } }),
    prisma.document.findMany({
      where: { caseId: auftrag.caseId },
      select: {
        id: true,
        originalName: true,
        generatedName: true,
        documentType: true,
        reviewStatus: true,
        reviewNote: true,
        createdAt: true,
        scanStatus: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.applicant.findMany({
      where: { caseId: auftrag.caseId },
      select: { position: true, vorname: true, nachname: true },
      orderBy: { position: "asc" },
    }),
    ladeRueckfragen(auftrag.id, true),
    ladeVerlauf(auftrag.id, true),
  ]);

  const fehlend = aggregat?.missing ?? [];
  const offeneRueckfragen = rueckfragen.filter((r) => r.status === "offen");
  const erledigteRueckfragen = rueckfragen.filter((r) => r.status !== "offen");
  const ergebnisse = ergebnisseFuer(auftrag.leistungen);
  const ergebnisSichtbar = Boolean(auftrag.uebergebenAm) && (status === "uebergeben" || status === "abgeschlossen");
  const maxMb = getEnv().UPLOAD_MAX_MB;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Auftrag"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {auftrag.auftragsnummer}
            <StatusMarke status={status} pausiert={Boolean(auftrag.pausiertSeit)} portal className="translate-y-[-2px]" />
          </span>
        }
        subtitle={auftrag.aktenbezeichnung ?? auftragsartLabel(auftrag.auftragsart)}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/portal/auftraege">
              <ArrowLeft />
              Alle Aufträge
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-5 p-5">
          <StationenLeiste status={status} portal />
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Backoffice</dt>
              <dd className="mt-0.5 font-medium">{partner?.backofficeName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Eingang</dt>
              <dd className="mt-0.5 tabular">{datumText(auftrag.eingangAm)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Zugesagte Frist</dt>
              <dd className="mt-0.5 tabular">{datumText(auftrag.faelligAm)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Ihre Referenz</dt>
              <dd className="mt-0.5">{auftrag.referenzExtern ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Auftragsart und Leistungen</dt>
              <dd className="mt-1">
                <span className="font-medium">{auftragsartLabel(auftrag.auftragsart)}</span>
                {auftrag.leistungen.length > 0 ? (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {auftrag.leistungen.map((l) => (
                      <li key={l} className="rounded-full border px-2.5 py-0.5 text-xs">
                        {leistungsLabel(l)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </dd>
            </div>
            {auftrag.pausiertSeit && auftrag.wartegrund ? (
              <div className="sm:col-span-2 lg:col-span-4">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Hinweis des Backoffice</dt>
                <dd className="mt-0.5">{auftrag.wartegrund}</dd>
              </div>
            ) : status === "wartet_auf_unterlagen" && auftrag.wartegrund ? (
              <div className="sm:col-span-2 lg:col-span-4">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Was fehlt</dt>
                <dd className="mt-0.5">{auftrag.wartegrund}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {ergebnisSichtbar ? (
        <Card id="ergebnis" className="border-success/40">
          <CardHeader>
            <CardTitle>Ergebnis</CardTitle>
            <CardDescription>
              Übergeben {datumZeitText(auftrag.uebergebenAm)}
              {auftrag.abgenommenAm ? ` · Abgenommen ${datumZeitText(auftrag.abgenommenAm)}` : " · Abnahme offen"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {auftrag.ergebnisText ? <p className="whitespace-pre-line text-sm">{auftrag.ergebnisText}</p> : null}

            {ergebnisse.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {ergebnisse.map((e) => {
                  const type = ERGEBNIS_ROUTE_TYPE[e];
                  return (
                    <li key={e} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{ERGEBNIS_LABELS[e]}</span>
                      </span>
                      {type ? (
                        <Button asChild variant="outline" size="sm">
                          <a href={`/api/portal/auftraege/${auftrag.id}/ergebnis?type=${type}`}>
                            <Download />
                            Herunterladen
                          </a>
                        </Button>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">über Ihre Plattform</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Für diesen Auftrag ist kein Download vorgesehen; das Ergebnis steht im Text oben.</p>
            )}

            {auftrag.abgenommenAm ? (
              auftrag.abnahmeKommentar ? (
                <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Ihr Kommentar zur Abnahme</span>
                  <br />
                  {auftrag.abnahmeKommentar}
                </p>
              ) : null
            ) : (
              <div className="space-y-4 border-t pt-5">
                <AbnahmeForm auftragId={auftrag.id} />
                {status === "uebergeben" ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Stimmt etwas nicht? Das Backoffice bessert nach.</p>
                    <NachbearbeitungForm auftragId={auftrag.id} />
                  </div>
                ) : null}
              </div>
            )}

            <div className="border-t pt-5">
              <FeedbackForm auftragId={auftrag.id} bewertung={auftrag.feedbackBewertung} text={auftrag.feedbackText} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {offeneRueckfragen.length > 0 ? (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle>Rückfragen des Backoffice</CardTitle>
            <CardDescription>
              {offeneRueckfragen.length === 1 ? "Eine Rückfrage wartet" : `${offeneRueckfragen.length} Rückfragen warten`} auf Ihre Antwort.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {offeneRueckfragen.map((r) => (
              <div key={r.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <div>
                  <div className="text-sm font-medium">{r.betreff}</div>
                  <div className="text-xs text-muted-foreground">Gestellt {datumZeitText(r.gestelltAm)}</div>
                </div>
                <p className="whitespace-pre-line text-sm">{r.frage}</p>
                <RueckfrageAntwortForm auftragId={auftrag.id} rueckfrageId={r.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fehlende Unterlagen</CardTitle>
            <CardDescription>
              {ungeprueft > 0
                ? `${ungeprueft} ${ungeprueft === 1 ? "Dokument ist" : "Dokumente sind"} noch ungeprüft – die Liste kann sich nach der Prüfung verkürzen.`
                : "Stand nach Prüfung aller eingereichten Dokumente."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aggregat == null ? (
              <p className="text-sm text-muted-foreground">Der Unterlagenstand ist gerade nicht abrufbar. Bitte später erneut öffnen.</p>
            ) : fehlend.length === 0 ? (
              <p className="text-sm text-success">Alle angeforderten Unterlagen liegen vor.</p>
            ) : (
              <ul className="divide-y text-sm">
                {fehlend.map((m) => (
                  <li key={m.key} className="flex flex-wrap items-baseline justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <span>{m.name}</span>
                    <span className="text-xs text-muted-foreground">{PORTAL_LEVEL_LABELS[m.level]}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card id="unterlagen">
          <CardHeader>
            <CardTitle>Unterlagen hochladen</CardTitle>
            <CardDescription>Direkt in die Akte des Auftrags. Das Backoffice prüft und ordnet zu.</CardDescription>
          </CardHeader>
          <CardContent>
            {terminal ? (
              <p className="text-sm text-muted-foreground">Der Auftrag ist abgeschlossen; es können keine Unterlagen mehr hochgeladen werden.</p>
            ) : (
              <PortalUploadForm
                auftragId={auftrag.id}
                maxMb={maxMb}
                applicants={applicants.map((a) => ({ position: a.position, name: [a.vorname, a.nachname].filter(Boolean).join(" ") }))}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload-Link für den Antragsteller</CardTitle>
          <CardDescription>Der Antragsteller lädt darüber selbst hoch, ohne Einblick in den Auftrag.</CardDescription>
        </CardHeader>
        <CardContent>
          <UploadLinkForm auftragId={auftrag.id} gesperrt={terminal} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hochgeladene Unterlagen</CardTitle>
          <CardDescription>{dokumente.length === 0 ? "Noch nichts hochgeladen." : `${dokumente.length} ${dokumente.length === 1 ? "Dokument" : "Dokumente"} in der Akte.`}</CardDescription>
        </CardHeader>
        <CardContent>
          {dokumente.length === 0 ? (
            <p className="text-sm text-muted-foreground">Laden Sie Unterlagen oben hoch oder geben Sie dem Antragsteller einen Upload-Link.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dokument</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hochgeladen</TableHead>
                    <TableHead className="text-right">Datei</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dokumente.map((d) => {
                    const abrufbar = isDeliverableScanStatus(d.scanStatus);
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="max-w-[18rem] truncate font-medium">{d.generatedName ?? d.originalName}</TableCell>
                        <TableCell className="whitespace-nowrap">{d.documentType ? DOCUMENT_TYPE_LABELS[d.documentType as DocumentType] : "Wird eingestuft"}</TableCell>
                        <TableCell>
                          <span
                            className={
                              d.reviewStatus === "akzeptiert"
                                ? "text-success"
                                : d.reviewStatus === "abgelehnt"
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                            }
                          >
                            {reviewLabel(d.reviewStatus)}
                          </span>
                          {d.reviewStatus === "abgelehnt" && d.reviewNote ? (
                            <div className="mt-0.5 max-w-[20rem] text-xs text-muted-foreground">{d.reviewNote}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="tabular whitespace-nowrap">{datumText(d.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          {abrufbar ? (
                            <a
                              href={`/api/portal/auftraege/${auftrag.id}/dokumente/${d.id}`}
                              className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Herunterladen
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sicherheitsprüfung läuft</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {erledigteRueckfragen.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Beantwortete Rückfragen</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {erledigteRueckfragen.map((r) => (
              <div key={r.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                <div className="text-sm font-medium">{r.betreff}</div>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{r.frage}</p>
                {r.antwort ? (
                  <p className="whitespace-pre-line rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">Ihre Antwort · {datumZeitText(r.beantwortetAm)}</span>
                    <br />
                    {r.antwort}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hinweise an das Backoffice</CardTitle>
            <CardDescription>Was das Backoffice über diesen Fall wissen sollte.</CardDescription>
          </CardHeader>
          <CardContent>
            <HinweiseForm auftragId={auftrag.id} hinweise={auftrag.hinweiseAuftraggeber} gesperrt={terminal} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verlauf</CardTitle>
            <CardDescription>Die für Sie sichtbaren Schritte des Auftrags.</CardDescription>
          </CardHeader>
          <CardContent>
            {verlauf.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Einträge.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {verlauf.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="tabular w-[7.5rem] shrink-0 text-xs text-muted-foreground">{datumZeitText(e.createdAt)}</span>
                    <span className="min-w-0">
                      {e.nachStatus ? (
                        <span className="font-medium">{BACKOFFICE_STATUS_PORTAL_LABELS[e.nachStatus as BackofficeStatus]}</span>
                      ) : null}
                      {e.text ? <span className={e.nachStatus ? "block text-muted-foreground" : ""}>{e.text}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
