import Link from "next/link";
import { notFound } from "next/navigation";
// Kopfzeit für die (jetzt parallelisierte) KI-Prüfung über alle Dokumente sowie
// die Vermittler-Upload-Actions, die von dieser Route ausgeführt werden.
export const maxDuration = 300;
import { ScanSearch, Link2, Send, FileText, FileBarChart, AlertTriangle, MapPin, FolderArchive, UserRound, Ruler, TrendingUp, ArrowLeft, Calculator, ClipboardList, Banknote, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { getCaseCockpit } from "@/lib/cases/cockpit";
import { listUploadLinks } from "@/lib/security/upload-link";
import { runAiCheck } from "@/lib/actions/cases";
import { UploadLinkManager } from "@/components/case/upload-link-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaseTabs } from "@/components/case/case-tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CaseStatusBadge, SeverityBadge } from "@/components/status-badge";
import { ProgressRing } from "@/components/case/progress-ring";
import { PlatformReadiness } from "@/components/case/platform-readiness";
import { CaseRoadmap } from "@/components/case/case-roadmap";
import { NextBestAction } from "@/components/case/next-best-action";
import { MissingDocumentsPanel } from "@/components/case/missing-documents-panel";
import { DangerZone } from "@/components/case/danger-zone";
import { BrokerUploadForm } from "@/components/case/broker-upload-form";
import { DocumentTypeSelect } from "@/components/review/document-type-select";
import { ApplicantSelect } from "@/components/review/applicant-select";
import { maxUploadMb } from "@/lib/documents/pipeline";
import { formatEUR, formatConfidence } from "@/lib/utils";
import { TONE } from "@/lib/ui/tone";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  CASE_STATUS_LABELS,
  DOCUMENT_REVIEW_STATUS_LABELS,
  LOCKED_CASE_STATUSES,
  type CaseStatus,
  type DocumentReviewStatus,
  type DocumentType,
  type Severity,
} from "@/lib/domain/enums";

export default async function CaseCockpitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const ctx = await requireContext();

  const caseRow = await prisma.case.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { applicants: { orderBy: { position: "asc" } }, property: true, financingRequest: true },
  });
  if (!caseRow) notFound();

  const cockpit = await getCaseCockpit(id);
  const [documents, plausibility, uploadLinks] = await Promise.all([
    prisma.document.findMany({ where: { caseId: id }, include: { warnings: true }, orderBy: { createdAt: "asc" } }),
    prisma.plausibilityCheck.findMany({ where: { caseId: id }, orderBy: { createdAt: "asc" } }),
    listUploadLinks(id, ctx.organizationId),
  ]);
  const applicantOptions = caseRow.applicants.map((a) => ({
    position: a.position,
    name: [a.vorname, a.nachname].filter(Boolean).join(" "),
  }));
  const uploadLinkRows = uploadLinks.map((l) => ({
    id: l.id,
    expiresAt: l.expiresAt.toISOString(),
    active: l.active,
    expired: l.expired,
    maxUploads: l.maxUploads,
    usedCount: l.usedCount,
  }));

  // Die KI-Prüfung verweigert bei diesen Status still den Dienst – das sagen wir
  // dem Nutzer, statt einen Button anzubieten, auf dessen Klick nichts passiert.
  const aiCheckLocked = LOCKED_CASE_STATUSES.has(caseRow.status as CaseStatus);

  // Bei Paar-Finanzierungen kommen Kunden-Uploads ohne Antragsteller-Zuordnung an
  // (der gemeinsame Link verrät nicht, wer hochgeladen hat). Der Vermittler ordnet zu.
  const mehrereAntragsteller = caseRow.applicants.length > 1;
  const applicantSelectOptions = caseRow.applicants.map((a) => ({
    id: a.id,
    name: [a.vorname, a.nachname].filter(Boolean).join(" ") || `Antragsteller ${a.position}`,
  }));
  const istSelbststaendig =
    caseRow.primaryEmploymentType === "selbststaendiger" ||
    caseRow.primaryEmploymentType === "geschaeftsfuehrer" ||
    caseRow.primaryEmploymentType === "gesellschafter";

  return (
    <div className="space-y-6">
      {/* Rückweg zur Fallliste – auf Mobile (Sidebar eingeklappt) der einzige. */}
      <Link
        href="/cases"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Alle Fälle
      </Link>

      {/* Hero / Case-Kopf */}
      <Card>
        <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center">
          <ProgressRing value={cockpit.score} label={cockpit.scoreLabel} sublabel="einreichungsfertig" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">{cockpit.applicantNames}</h1>
              <span className="font-mono text-sm text-muted-foreground">{cockpit.caseNumber}</span>
              <CaseStatusBadge status={caseRow.status as CaseStatus} />
              {caseRow.bankName && (
                <Badge variant="neutral" className="gap-1"><Banknote className="h-3 w-3" />{caseRow.bankName}</Badge>
              )}
              {caseRow.wiedervorlage && (
                <Badge variant={caseRow.wiedervorlage < new Date() ? "warning" : "neutral"} className="gap-1">
                  <CalendarClock className="h-3 w-3" />
                  WV {caseRow.wiedervorlage.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </Badge>
              )}
            </div>
            {cockpit.blockers.length > 0 && (
              <div className="mt-2 space-y-1">
                {cockpit.blockers.map((b, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-sm text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {b}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Plattform-Bereitschaft</div>
              <PlatformReadiness items={cockpit.platformReadiness} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hauptbereich: Roadmap + Tabs | Sidebar */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Weg zur Einreichung</CardTitle></CardHeader>
            <CardContent><CaseRoadmap steps={cockpit.roadmap} /></CardContent>
          </Card>

          <CaseTabs defaultValue="fehlt" tabParam={tab}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="fehlt">Was fehlt noch? ({cockpit.counts.docsMissing})</TabsTrigger>
              <TabsTrigger value="dokumente">Dokumente ({documents.length})</TabsTrigger>
              <TabsTrigger value="plausibilitaet">Plausibilität ({cockpit.counts.warnings})</TabsTrigger>
              <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
            </TabsList>

            <TabsContent value="fehlt">
              <Card><CardContent className="pt-6"><MissingDocumentsPanel groups={cockpit.missingGroups} nachforderungHref={`/cases/${id}/messages`} /></CardContent></Card>
            </TabsContent>

            <TabsContent value="dokumente">
              <div className="space-y-4">
                <Card id="broker-upload" className="scroll-mt-24">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Dokumente hochladen</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Beliebige Unterlagen selbst einwerfen – Klassifizierung, Umbenennung und Zuordnung laufen automatisch.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <BrokerUploadForm caseId={id} maxMb={maxUploadMb()} applicants={applicantOptions} />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Dateiname</TableHead>
                          <TableHead>Typ</TableHead>
                          {mehrereAntragsteller && <TableHead>Antragsteller</TableHead>}
                          <TableHead>Konfidenz</TableHead>
                          <TableHead>Hinweise</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {documents.length === 0 && (
                          <TableRow><TableCell colSpan={mehrereAntragsteller ? 6 : 5} className="py-10 text-center text-sm text-muted-foreground">Noch keine Dokumente. Lade oben selbst welche hoch oder erstelle einen Upload-Link für den Kunden.</TableCell></TableRow>
                        )}
                        {documents.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium">{d.generatedName ?? d.originalName}</TableCell>
                            <TableCell><DocumentTypeSelect documentId={d.id} value={d.documentType as DocumentType | null} /></TableCell>
                            {mehrereAntragsteller && (
                              <TableCell>
                                <ApplicantSelect documentId={d.id} value={d.applicantId} applicants={applicantSelectOptions} />
                              </TableCell>
                            )}
                            <TableCell className="font-mono tabular">{formatConfidence(d.confidence)}</TableCell>
                            <TableCell>{d.warnings.length > 0 ? <Badge variant="warning">{d.warnings.length}</Badge> : "—"}</TableCell>
                            <TableCell>
                              {/* Nie den rohen Enum-Wert zeigen ("duplikat", "ersetzt"). */}
                              {d.reviewStatus === "offen" ? (
                                <Badge variant="ai">{DOCUMENT_REVIEW_STATUS_LABELS.offen}</Badge>
                              ) : d.reviewStatus === "akzeptiert" ? (
                                <Badge variant="success">{DOCUMENT_REVIEW_STATUS_LABELS.akzeptiert}</Badge>
                              ) : (
                                <Badge variant="neutral">
                                  {DOCUMENT_REVIEW_STATUS_LABELS[d.reviewStatus as DocumentReviewStatus] ?? d.reviewStatus}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="plausibilitaet">
              <Card>
                <CardContent className="space-y-2 pt-6">
                  {plausibility.length === 0 && <p className="text-sm text-muted-foreground">Keine Auffälligkeiten erkannt.</p>}
                  {plausibility.map((p) => (
                    <div key={p.id} className={`flex items-start justify-between gap-4 rounded-lg border p-3 ${TONE[p.status === "kritisch" ? "blocker" : p.status === "warnung" ? "review" : "ready"].border}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={p.status as Severity} />
                          <span className="text-sm font-medium">{p.category}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{p.explanation}</p>
                        {p.recommendedAction && <p className="mt-1 text-xs text-foreground">Empfehlung: {p.recommendedAction}</p>}
                      </div>
                      <Badge variant="neutral">nur intern</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="uebersicht">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Objekt & Finanzierung</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    <Row label="Objektart" value={caseRow.property?.objektart ?? "—"} />
                    <Row label="Adresse" value={[caseRow.property?.street, caseRow.property?.zip, caseRow.property?.city].filter(Boolean).join(", ") || "—"} />
                    <Row label="Wohnfläche" value={caseRow.property?.wohnflaeche ? `${caseRow.property.wohnflaeche} m²` : "—"} />
                    <Separator className="my-2" />
                    <Row label="Kaufpreis" value={<span className="font-mono tabular">{formatEUR(caseRow.financingRequest?.kaufpreis)}</span>} />
                    <Row label="Eigenkapital" value={<span className="font-mono tabular">{formatEUR(caseRow.financingRequest?.eigenkapital)}</span>} />
                    <Row label="Darlehenswunsch" value={<span className="font-mono tabular">{formatEUR(caseRow.financingRequest?.darlehenswunsch)}</span>} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Antragsteller</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {caseRow.applicants.map((a) => (
                      <div key={a.id} className="rounded-md border p-3">
                        <div className="flex items-center gap-2 font-medium">
                          {[a.vorname, a.nachname].filter(Boolean).join(" ") || `Antragsteller ${a.position}`}
                          {!a.geburtsdatum && <Badge variant="destructive">Geburtsdatum fehlt</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{[a.city, a.familienstand ?? undefined].filter(Boolean).join(" · ")}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </CaseTabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <NextBestAction actions={cockpit.nextActions} />
          <Card id="upload-link" className="scroll-mt-24">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" /> Sicherer Upload-Link
              </CardTitle>
            </CardHeader>
            <CardContent>
              <UploadLinkManager caseId={id} links={uploadLinkRows} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Aktionen</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {aiCheckLocked ? (
                <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  Die KI-Prüfung ist gesperrt, weil der Fall bereits{" "}
                  {CASE_STATUS_LABELS[caseRow.status as CaseStatus].toLowerCase()} ist.
                </div>
              ) : (
                <form action={runAiCheck.bind(null, id)}>
                  <SubmitButton variant="ai" className="w-full justify-start" pendingLabel="KI prüft die Unterlagen …">
                    <ScanSearch />KI-Prüfung starten
                  </SubmitButton>
                </form>
              )}
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/edit`}><UserRound />Kundendaten bearbeiten</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/messages`}><Send />Nachforderung erzeugen</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/review?case=${id}`}><ScanSearch />Review-Center öffnen</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/haushalt`}><Calculator />Haushaltsrechnung</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/verwaltung`}><ClipboardList />Verwaltung & Fristen</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/export`}><FileText />Export vorbereiten</Link></Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Dokumente erzeugen</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/summary`}><FileBarChart />Bankfähige Zusammenfassung</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/wohnflaeche`}><Ruler />Wohnflächenberechnung</Link></Button>
              {/* Selbständigen-Werkzeug nur zeigen, wenn es zum Fall passt. */}
              {istSelbststaendig && (
                <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/einkommen-selbststaendig`}><TrendingUp />Selbständigen-Einkommen (PDF)</Link></Button>
              )}
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/lageplan`}><MapPin />Lageplan erzeugen</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><a href={`/api/cases/${id}/zip`}><FolderArchive />Alle Dokumente als ZIP</a></Button>
            </CardContent>
          </Card>
          <DangerZone caseId={id} caseNumber={cockpit.caseNumber} archived={caseRow.status === "archiviert"} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
