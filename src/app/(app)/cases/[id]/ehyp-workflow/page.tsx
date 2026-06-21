import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, FileDown } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import { europaceToEhyp, buildPlatformMapping } from "@/lib/platforms/mapping";
import { releasePlatform } from "@/lib/actions/cases";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CopyBlock } from "@/components/copy-block";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/domain/enums";

const STEPS = [
  "Europace-Daten laden",
  "In internes Datenmodell umwandeln",
  "eHyp-home-Pflichtfelder prüfen",
  "Fehlende Daten markieren",
  "Kopiermaske erzeugen",
  "Dokumente markieren",
  "Manuelle Freigabe",
];

export default async function EhypWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCaseAccess(id);
  const canonical = await caseToCanonical(id);
  const r = europaceToEhyp(canonical);
  const europace = buildPlatformMapping(canonical, "europace");
  const json = JSON.stringify(r.ehypPayload, null, 2);
  const ready = r.missingForEhyp.length === 0;

  // Labels der fehlenden eHyp-Pflichtfelder auflösen.
  const ehypFields = r.ehypPayload.groups.flatMap((g) => g.fields);
  const missingLabels = r.missingForEhyp.map(
    (pf) => ehypFields.find((f) => f.platformField === pf)?.label ?? pf
  );

  // Kopiermaske für eHyp home (flach, zum manuellen Abtippen).
  const kopiermaske = r.ehypPayload.groups
    .map(
      (g) =>
        `## ${g.group}\n` +
        g.fields.map((f) => `${f.label}: ${f.value === null || f.value === "" ? "—" : String(f.value)}`).join("\n")
    )
    .join("\n\n");

  // Dokumente für eHyp home (Freigabe-Status sichtbar machen).
  const documents = await prisma.document.findMany({
    where: { caseId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, generatedName: true, originalName: true, documentType: true, reviewStatus: true },
  });

  // Europace-Quelldaten (flach) zur Nachvollziehbarkeit der Übernahme.
  const europaceSource = europace.groups
    .map((g) => `${g.group}: ` + g.fields.map((f) => `${f.label}=${f.value ?? "—"}`).join(", "))
    .join("\n");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Plattform-Übernahme"
        title={
          <span className="flex items-center gap-2">
            Europace <ArrowRight className="h-5 w-5 text-muted-foreground" /> eHyp home
          </span>
        }
        subtitle="Übernahme über das interne kanonische Modell. Fehlende eHyp-home-Pflichtfelder und Datenmodell-Unterschiede werden sichtbar gemacht – die Freigabe bleibt manuell."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${id}`}>
              <ArrowLeft />
              Zur Fallakte
            </Link>
          </Button>
        }
      />

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step}>
            <Card className="h-full">
              <CardContent className="flex items-start gap-3 p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ai/12 font-mono tabular text-sm font-semibold text-ai">
                  {i + 1}
                </span>
                <span className="text-sm">{step}</span>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1) Europace-Quelldaten (geladen)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">
            Aus dem Europace-Vorgang ins interne kanonische Modell normalisiert. Keine echte API-Übertragung – Demo-/Falldaten.
          </p>
          <CopyBlock text={europaceSource} label="Europace-Daten kopieren" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fehlende eHyp-home-Pflichtfelder</CardTitle>
        </CardHeader>
        <CardContent>
          {ready ? (
            <Badge variant="success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Bereit für eHyp home
            </Badge>
          ) : (
            <div className="flex flex-wrap gap-2">
              {missingLabels.map((l, i) => (
                <Badge key={`${l}-${i}`} variant="warning">
                  {l}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datenmodell-Unterschiede</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feld</TableHead>
                <TableHead>Europace</TableHead>
                <TableHead>eHyp home</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.differences.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                    Keine inhaltlichen Unterschiede – nur die Feldbenennungen differieren.
                  </TableCell>
                </TableRow>
              ) : (
                r.differences.map((d) => (
                  <TableRow key={d.field}>
                    <TableCell className="font-medium">{d.field}</TableCell>
                    <TableCell className="font-mono tabular">{String(d.europace ?? "—")}</TableCell>
                    <TableCell className="font-mono tabular">{String(d.ehyp ?? "—")}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dokumente für eHyp home</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dokument</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Freigabe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                    Noch keine Dokumente im Fall.
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.generatedName ?? d.originalName}</TableCell>
                    <TableCell>{d.documentType ? DOCUMENT_TYPE_LABELS[d.documentType as DocumentType] : "—"}</TableCell>
                    <TableCell>
                      {d.reviewStatus === "akzeptiert" ? (
                        <Badge variant="success">freigegeben</Badge>
                      ) : (
                        <Badge variant="neutral">offen</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Kopiermaske eHyp home</CardTitle>
          </CardHeader>
          <CardContent>
            <CopyBlock text={kopiermaske} label="Kopiermaske kopieren" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">eHyp-home-Export (JSON)</CardTitle>
          </CardHeader>
          <CardContent>
            <CopyBlock text={json} label="JSON kopieren" />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <form action={releasePlatform.bind(null, id, "ehyp_home")}>
          <Button variant="success" type="submit" disabled={!ready}>
            <CheckCircle2 className="h-4 w-4" />
            Status „bereit für eHyp home" setzen
          </Button>
        </form>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/cases/${id}/pdf?type=platform&platform=ehyp_home`}>
            <FileDown className="h-4 w-4" />
            Exportpaket (PDF)
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/cases/${id}/pdf?type=checklist`}>
            <FileText className="h-4 w-4" />
            Unterlagen-Checkliste
          </a>
        </Button>
        {!ready && (
          <span className="text-sm text-muted-foreground">
            Freigabe erst möglich, wenn alle Pflichtfelder vorliegen.
          </span>
        )}
      </div>
    </div>
  );
}
