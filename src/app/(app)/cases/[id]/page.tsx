import Link from "next/link";
import { notFound } from "next/navigation";
import { ScanSearch, Link2, Send, FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { getCaseAggregate } from "@/lib/cases/service";
import { getEnv } from "@/lib/env";
import { AIService } from "@/lib/ai/service";
import {
  runAiCheck,
  createUploadLinkForm,
  releasePlatform,
} from "@/lib/actions/cases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CaseStatusBadge, SeverityBadge } from "@/components/status-badge";
import { ReadinessMeter } from "@/components/readiness-meter";
import { formatEUR } from "@/lib/utils";
import {
  CASE_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  PLATFORM_LABELS,
  REQUIREMENT_LEVEL_LABELS,
  type CaseStatus,
  type DocumentType,
  type Platform,
} from "@/lib/domain/enums";

const ai = new AIService();

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();

  const caseRow = await prisma.case.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { applicants: true, property: true, financingRequest: true },
  });
  if (!caseRow) notFound();

  const agg = await getCaseAggregate(id);
  const documents = await prisma.document.findMany({
    where: { caseId: id },
    include: { warnings: true, extractedFields: true },
    orderBy: { createdAt: "asc" },
  });
  const uploadLink = await prisma.uploadLink.findFirst({
    where: { caseId: id, active: true },
    orderBy: { createdAt: "desc" },
  });
  const uploadUrl = uploadLink ? `${getEnv().APP_BASE_URL}/upload/${uploadLink.token}` : null;

  const summary = ai.createBankSummary({
    ...agg.canonical,
    vorhandeneUnterlagen: agg.checklist.filter((i) => i.status === "vorhanden").map((i) => i.name),
    fehlendeUnterlagen: agg.missing.map((i) => i.name),
    risiken: agg.plausibility.filter((p) => p.status !== "ok").map((p) => p.explanation),
    offenePunkte: agg.missing.map((i) => i.name),
  });

  const applicants = caseRow.applicants
    .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      {/* Kopf */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{caseRow.caseNumber}</h1>
            <CaseStatusBadge status={caseRow.status as CaseStatus} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{applicants || "Ohne Namen"}</p>
        </div>
        <div className="w-64"><ReadinessMeter readiness={agg.readiness} /></div>
      </div>

      {/* "Was kann ich jetzt tun?" */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Was kann ich jetzt tun?</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <form action={runAiCheck.bind(null, id)}>
            <Button size="sm" type="submit"><ScanSearch />KI-Prüfung starten</Button>
          </form>
          <form action={createUploadLinkForm.bind(null, id)}>
            <Button size="sm" variant="outline" type="submit"><Link2 />Upload-Link erstellen</Button>
          </form>
          <Button asChild size="sm" variant="outline"><Link href={`/cases/${id}/messages`}><Send />Nachforderung erstellen</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/cases/${id}/export`}><FileText />Export vorbereiten</Link></Button>
          <Button asChild size="sm" variant="ghost"><Link href={`/review?case=${id}`}>Review-Center</Link></Button>
        </CardContent>
      </Card>

      {uploadUrl && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <span className="font-medium">Aktiver Upload-Link:</span>{" "}
          <a href={uploadUrl} className="break-all text-primary underline" target="_blank" rel="noreferrer">{uploadUrl}</a>
        </div>
      )}

      <Tabs defaultValue="uebersicht">
        <TabsList className="flex-wrap">
          <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
          <TabsTrigger value="checkliste">Checkliste & Fehlende ({agg.missing.length})</TabsTrigger>
          <TabsTrigger value="dokumente">Dokumente ({documents.length})</TabsTrigger>
          <TabsTrigger value="plausibilitaet">Plausibilität</TabsTrigger>
          <TabsTrigger value="zusammenfassung">Zusammenfassung</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        {/* Übersicht */}
        <TabsContent value="uebersicht">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Objekt & Finanzierung</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Row label="Objektart" value={caseRow.property?.objektart ?? "—"} />
                <Row label="Objektadresse" value={[caseRow.property?.street, caseRow.property?.zip, caseRow.property?.city].filter(Boolean).join(", ") || "—"} />
                <Row label="Wohnfläche" value={caseRow.property?.wohnflaeche ? `${caseRow.property.wohnflaeche} m²` : "—"} />
                <Separator className="my-2" />
                <Row label="Kaufpreis" value={formatEUR(caseRow.financingRequest?.kaufpreis)} />
                <Row label="Eigenkapital" value={formatEUR(caseRow.financingRequest?.eigenkapital)} />
                <Row label="Darlehenswunsch" value={formatEUR(caseRow.financingRequest?.darlehenswunsch)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Antragsteller</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {caseRow.applicants.map((a) => (
                  <div key={a.id} className="rounded-md border p-3">
                    <div className="font-medium">{[a.vorname, a.nachname].filter(Boolean).join(" ") || `Antragsteller ${a.position}`}</div>
                    <div className="text-xs text-muted-foreground">{[a.city, a.familienstand ?? undefined].filter(Boolean).join(" · ")}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base">Plattform-IDs</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 gap-4 text-sm">
                <Row label="FinLink-ID" value={caseRow.finlinkId ?? "—"} />
                <Row label="Europace-Vorgang" value={caseRow.europaceVorgangId ?? "—"} />
                <Row label="eHyp-home-ID" value={caseRow.ehypHomeId ?? "—"} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Checkliste & Fehlende */}
        <TabsContent value="checkliste">
          <Card>
            <CardHeader><CardTitle className="text-base">Unterlagen-Checkliste</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unterlage</TableHead>
                    <TableHead>Pflicht</TableHead>
                    <TableHead>Plattform</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agg.checklist.map((i) => (
                    <TableRow key={i.key}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="text-xs">{REQUIREMENT_LEVEL_LABELS[i.level]}</TableCell>
                      <TableCell className="space-x-1">
                        {i.platforms.map((p) => (<Badge key={p} variant="outline">{PLATFORM_LABELS[p]}</Badge>))}
                      </TableCell>
                      <TableCell><ChecklistStatusBadge status={i.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dokumente */}
        <TabsContent value="dokumente">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dateiname</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Konfidenz</TableHead>
                    <TableHead>Warnungen</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Noch keine Dokumente. Erstelle einen Upload-Link.</TableCell></TableRow>
                  )}
                  {documents.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.generatedName ?? d.originalName}</TableCell>
                      <TableCell>{d.documentType ? DOCUMENT_TYPE_LABELS[d.documentType as DocumentType] : "—"}</TableCell>
                      <TableCell className="tabular-nums">{d.confidence != null ? `${Math.round(d.confidence * 100)} %` : "—"}</TableCell>
                      <TableCell>{d.warnings.length > 0 ? <Badge variant="warning">{d.warnings.length}</Badge> : "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{d.reviewStatus}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plausibilität */}
        <TabsContent value="plausibilitaet">
          <Card>
            <CardHeader><CardTitle className="text-base">Plausibilitäts- & KO-Prüfung (intern)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {agg.plausibility.map((p) => (
                <div key={p.key} className="flex items-start justify-between gap-4 rounded-md border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={p.status} />
                      <span className="text-sm font-medium">{p.category}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{p.explanation}</p>
                  </div>
                  {!p.customerVisible && <Badge variant="secondary">nur intern</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Zusammenfassung */}
        <TabsContent value="zusammenfassung">
          <Card>
            <CardHeader><CardTitle className="text-base">Bankfähige Zusammenfassung (neutral)</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SummaryRow label="Kurzprofil" value={summary.kurzprofil} />
              <SummaryRow label="Einkommen & Beschäftigung" value={summary.einkommenBeschaeftigung} />
              {summary.selbststaendigkeit && <SummaryRow label="Selbstständigkeit" value={summary.selbststaendigkeit} />}
              <SummaryRow label="Objektübersicht" value={summary.objektuebersicht} />
              <SummaryRow label="Finanzierungsbedarf" value={summary.finanzierungsbedarf} />
              <SummaryRow label="Eigenkapital" value={summary.eigenkapital} />
              <SummaryList label="Fehlende Unterlagen" items={summary.fehlendeUnterlagen} />
              <SummaryList label="Risiken / Hinweise (neutral)" items={summary.risikenNeutral} />
              <Button asChild size="sm" variant="outline"><Link href={`/cases/${id}/summary`}>Vollansicht & Kopiermaske</Link></Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export */}
        <TabsContent value="export">
          <div className="grid gap-4 md:grid-cols-3">
            {(["europace", "finlink", "ehyp_home"] as Platform[]).map((p) => (
              <Card key={p}>
                <CardHeader><CardTitle className="text-base">{PLATFORM_LABELS[p]}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Bereitet das Daten-Mapping vor. Übertragung nur nach manueller Freigabe.
                  </p>
                  <form action={releasePlatform.bind(null, id, p)}>
                    <Button size="sm" variant="success" type="submit" className="w-full">Für {PLATFORM_LABELS[p]} freigeben</Button>
                  </form>
                  <Button asChild size="sm" variant="outline" className="w-full"><Link href={`/cases/${id}/export?platform=${p}`}>Kopiermaske öffnen</Link></Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-4">
            <Button asChild variant="outline" size="sm"><Link href={`/cases/${id}/ehyp-workflow`}>Europace → eHyp-home-Workflow</Link></Button>
          </div>
        </TabsContent>
      </Tabs>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <p>{value}</p>
    </div>
  );
}

function SummaryList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <ul className="ml-4 list-disc">{items.map((i, k) => (<li key={k}>{i}</li>))}</ul>
    </div>
  );
}

function ChecklistStatusBadge({ status }: { status: string }) {
  const map: Record<string, { v: "success" | "warning" | "secondary" | "destructive"; l: string }> = {
    vorhanden: { v: "success", l: "Vorhanden" },
    offen: { v: "secondary", l: "Offen" },
    unvollstaendig: { v: "warning", l: "Unvollständig" },
    nicht_aktuell: { v: "warning", l: "Nicht aktuell" },
    abgelehnt: { v: "destructive", l: "Abgelehnt" },
    nicht_erforderlich: { v: "secondary", l: "Nicht erforderlich" },
  };
  const e = map[status] ?? { v: "secondary" as const, l: status };
  return <Badge variant={e.v}>{e.l}</Badge>;
}
