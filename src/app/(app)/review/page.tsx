import Link from "next/link";
import { ExternalLink, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { setDocumentReview } from "@/lib/actions/cases";
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
import { SubmitButton } from "@/components/ui/submit-button";
import { formatConfidence } from "@/lib/utils";
import {
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="KI-Auswertung"
        title="Review-Center"
        subtitle="Links die Vorschau, in der Mitte die erkannten Daten, rechts Hinweise. Prüfe, korrigiere und gib frei – jede Aktion wird im Audit-Log protokolliert."
      />

      {documents.length === 0 ? (
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
        documents.map((d) => {
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
                  <CardTitle className="text-base">{d.generatedName ?? d.originalName}</CardTitle>
                  <DocumentTypeSelect documentId={d.id} value={d.documentType as DocumentType | null} />
                  {applicantOptions.length > 1 && (
                    <ApplicantSelect documentId={d.id} value={d.applicantId} applicants={applicantOptions} />
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{d.case.caseNumber} · {name}</span>
                  <Badge variant="neutral" className="font-mono tabular">Konfidenz {formatConfidence(d.confidence)}</Badge>
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
                    <form action={setDocumentReview.bind(null, d.id, "akzeptiert")}>
                      <SubmitButton size="sm" variant="success" className="w-full" pendingLabel="Wird übernommen …">
                        Dokument akzeptieren
                      </SubmitButton>
                    </form>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button asChild size="sm" variant="outline"><Link href={`/cases/${d.caseId}/messages`}>Nachfordern</Link></Button>
                      <form action={setDocumentReview.bind(null, d.id, "abgelehnt")}>
                        <SubmitButton size="sm" variant="outline" className="w-full" pendingLabel="…">
                          Unlesbar
                        </SubmitButton>
                      </form>
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
