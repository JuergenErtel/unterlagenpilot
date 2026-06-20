import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import { europaceToEhyp } from "@/lib/platforms/mapping";
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
  await requireContext();
  const canonical = await caseToCanonical(id);
  const r = europaceToEhyp(canonical);
  const json = JSON.stringify(r.ehypPayload, null, 2);
  const ready = r.missingForEhyp.length === 0;

  // Labels der fehlenden eHyp-Pflichtfelder auflösen.
  const ehypFields = r.ehypPayload.groups.flatMap((g) => g.fields);
  const missingLabels = r.missingForEhyp.map(
    (pf) => ehypFields.find((f) => f.platformField === pf)?.label ?? pf
  );

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
          <CardTitle className="text-sm">eHyp-home-Export (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <CopyBlock text={json} label="JSON kopieren" />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <form action={releasePlatform.bind(null, id, "ehyp_home")}>
          <Button variant="success" type="submit" disabled={!ready}>
            Status „bereit für eHyp home" setzen
          </Button>
        </form>
        {!ready && (
          <span className="text-sm text-muted-foreground">
            Erst möglich, wenn alle Pflichtfelder vorliegen.
          </span>
        )}
      </div>
    </div>
  );
}
