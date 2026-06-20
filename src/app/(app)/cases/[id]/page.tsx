import Link from "next/link";
import { notFound } from "next/navigation";
import { ScanSearch, Link2, Send, FileText, FileBarChart, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { getCaseCockpit } from "@/lib/cases/cockpit";
import { getEnv } from "@/lib/env";
import { runAiCheck, createUploadLinkForm } from "@/lib/actions/cases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CaseStatusBadge, SeverityBadge } from "@/components/status-badge";
import { ProgressRing } from "@/components/case/progress-ring";
import { PlatformReadiness } from "@/components/case/platform-readiness";
import { CaseRoadmap } from "@/components/case/case-roadmap";
import { NextBestAction } from "@/components/case/next-best-action";
import { MissingDocumentsPanel } from "@/components/case/missing-documents-panel";
import { formatEUR, formatConfidence } from "@/lib/utils";
import { TONE } from "@/lib/ui/tone";
import {
  DOCUMENT_TYPE_LABELS,
  type CaseStatus,
  type DocumentType,
  type Severity,
} from "@/lib/domain/enums";

export default async function CaseCockpitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();

  const caseRow = await prisma.case.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { applicants: { orderBy: { position: "asc" } }, property: true, financingRequest: true },
  });
  if (!caseRow) notFound();

  const cockpit = await getCaseCockpit(id);
  const [documents, plausibility, uploadLink] = await Promise.all([
    prisma.document.findMany({ where: { caseId: id }, include: { warnings: true }, orderBy: { createdAt: "asc" } }),
    prisma.plausibilityCheck.findMany({ where: { caseId: id }, orderBy: { createdAt: "asc" } }),
    prisma.uploadLink.findFirst({ where: { caseId: id, active: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const uploadUrl = uploadLink ? `${getEnv().APP_BASE_URL}/upload/${uploadLink.token}` : null;

  return (
    <div className="space-y-6">
      {/* Hero / Case-Kopf */}
      <Card>
        <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center">
          <ProgressRing value={cockpit.score} label={cockpit.scoreLabel} sublabel="einreichungsfertig" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">{cockpit.applicantNames}</h1>
              <span className="font-mono text-sm text-muted-foreground">{cockpit.caseNumber}</span>
              <CaseStatusBadge status={caseRow.status as CaseStatus} />
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

      {uploadUrl && (
        <div className="rounded-lg border border-ai/30 bg-ai/[0.04] p-3 text-sm">
          <span className="font-medium">Aktiver Upload-Link:</span>{" "}
          <a href={uploadUrl} className="break-all font-mono text-xs text-ai underline" target="_blank" rel="noreferrer">{uploadUrl}</a>
        </div>
      )}

      {/* Hauptbereich: Roadmap + Tabs | Sidebar */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Weg zur Einreichung</CardTitle></CardHeader>
            <CardContent><CaseRoadmap steps={cockpit.roadmap} /></CardContent>
          </Card>

          <Tabs defaultValue="fehlt">
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
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dateiname</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead>Konfidenz</TableHead>
                        <TableHead>Hinweise</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Noch keine Dokumente. Erstelle einen Upload-Link, damit der Kunde seine Unterlagen sicher hochladen kann.</TableCell></TableRow>
                      )}
                      {documents.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.generatedName ?? d.originalName}</TableCell>
                          <TableCell>{d.documentType ? DOCUMENT_TYPE_LABELS[d.documentType as DocumentType] : "—"}</TableCell>
                          <TableCell className="font-mono tabular">{formatConfidence(d.confidence)}</TableCell>
                          <TableCell>{d.warnings.length > 0 ? <Badge variant="warning">{d.warnings.length}</Badge> : "—"}</TableCell>
                          <TableCell>
                            {d.reviewStatus === "offen"
                              ? <Badge variant="ai">prüfbereit</Badge>
                              : d.reviewStatus === "akzeptiert"
                                ? <Badge variant="success">akzeptiert</Badge>
                                : <Badge variant="neutral">{d.reviewStatus}</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
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
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <NextBestAction actions={cockpit.nextActions} />
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Aktionen</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              <form action={runAiCheck.bind(null, id)}><Button type="submit" variant="ai" className="w-full justify-start"><ScanSearch />KI-Prüfung starten</Button></form>
              <form action={createUploadLinkForm.bind(null, id)}><Button type="submit" variant="outline" className="w-full justify-start"><Link2 />Upload-Link erstellen</Button></form>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/messages`}><Send />Nachforderung erzeugen</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/review?case=${id}`}><ScanSearch />Review-Center öffnen</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/export`}><FileText />Export vorbereiten</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/cases/${id}/summary`}><FileBarChart />Bankfähige Zusammenfassung</Link></Button>
            </CardContent>
          </Card>
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
