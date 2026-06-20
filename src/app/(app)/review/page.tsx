import Link from "next/link";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { setDocumentReview } from "@/lib/actions/cases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SeverityBadge } from "@/components/status-badge";
import { formatConfidence } from "@/lib/utils";
import { DOCUMENT_TYPE_LABELS, PLATFORM_LABELS, type DocumentType, type Severity, type Platform } from "@/lib/domain/enums";

export default async function ReviewCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
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
      <div>
        <h1 className="text-2xl font-semibold">Review-Center</h1>
        <p className="text-sm text-muted-foreground">
          {documents.length} Dokument(e) zur Prüfung. Links Vorschau, rechts erkannte Daten. Jede Änderung wird auditiert.
        </p>
      </div>

      {documents.length === 0 && (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Keine offenen Dokumente zur Prüfung.</CardContent></Card>
      )}

      {documents.map((d) => (
        <Card key={d.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{d.generatedName ?? d.originalName}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{d.documentType ? DOCUMENT_TYPE_LABELS[d.documentType as DocumentType] : "unbekannt"}</Badge>
              <Badge variant="outline">Konfidenz {formatConfidence(d.confidence)}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 md:grid-cols-2">
              {/* Vorschau (Platzhalter) */}
              <div className="flex min-h-48 flex-col items-center justify-center rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                <FileText className="mb-2 h-8 w-8" />
                Dokumentvorschau
                <span className="mt-1 text-xs">{d.case.caseNumber} · {d.case.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).join(", ")}</span>
                <Link href={`/cases/${d.caseId}`} className="mt-2 text-xs text-primary underline">Zur Fallakte</Link>
              </div>

              {/* Erkannte Daten + Warnungen + Aktionen */}
              <div className="space-y-3">
                {d.warnings.length > 0 && (
                  <div className="space-y-1.5">
                    {d.warnings.map((w) => (
                      <div key={w.id} className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 p-2 text-xs">
                        <SeverityBadge severity={w.severity as Severity} />
                        <span>{w.message}</span>
                        {!w.customerVisible && <Badge variant="secondary" className="ml-auto">intern</Badge>}
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5">
                  {d.extractedFields.slice(0, 10).map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{f.correctedValue ?? f.value ?? "—"}</span>
                        <Badge variant={f.confidence < 0.6 ? "warning" : "outline"} className="text-[10px]">{formatConfidence(f.confidence)}</Badge>
                      </span>
                    </div>
                  ))}
                </div>

                <Separator />
                <div className="flex flex-wrap gap-2">
                  <form action={setDocumentReview.bind(null, d.id, "akzeptiert")}><Button size="sm" variant="success" type="submit">Akzeptieren</Button></form>
                  <form action={setDocumentReview.bind(null, d.id, "abgelehnt")}><Button size="sm" variant="destructive" type="submit">Ablehnen</Button></form>
                  <form action={setDocumentReview.bind(null, d.id, "duplikat")}><Button size="sm" variant="outline" type="submit">Als Duplikat</Button></form>
                  <Button asChild size="sm" variant="ghost"><Link href={`/cases/${d.caseId}/messages`}>Kunde nachfordern</Link></Button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  Freigabe je Plattform in der Fallakte → Export:
                  {(["europace", "finlink", "ehyp_home"] as Platform[]).map((p) => (<Badge key={p} variant="outline">{PLATFORM_LABELS[p]}</Badge>))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
