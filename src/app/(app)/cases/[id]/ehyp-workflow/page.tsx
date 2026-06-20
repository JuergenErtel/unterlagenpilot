import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { caseToCanonical } from "@/lib/platforms/case-loader";
import { europaceToEhyp } from "@/lib/platforms/mapping";
import { releasePlatform } from "@/lib/actions/cases";
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

export default async function EhypWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireContext();
  const canonical = await caseToCanonical(id);
  const result = europaceToEhyp(canonical);
  const json = JSON.stringify(result.ehypPayload, null, 2);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            Europace <ArrowRight className="h-5 w-5" /> eHyp home
          </h1>
          <p className="text-sm text-muted-foreground">
            Übernahme über das interne kanonische Modell. Fehlende eHyp-home-Pflichtfelder und Datenmodell-Unterschiede werden angezeigt.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm"><Link href={`/cases/${id}`}>Zur Fallakte</Link></Button>
      </div>

      <ol className="grid gap-2 md:grid-cols-5">
        {["Europace-Daten einlesen", "Intern normalisieren", "eHyp-Pflichtfelder prüfen", "Unterschiede anzeigen", "Kopiermaske / Freigabe"].map((step, i) => (
          <li key={i} className="rounded-md border bg-card p-3 text-xs">
            <div className="font-semibold text-primary">Schritt {i + 1}</div>
            {step}
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader><CardTitle className="text-base">Fehlende eHyp-home-Pflichtfelder</CardTitle></CardHeader>
        <CardContent>
          {result.missingForEhyp.length === 0 ? (
            <Badge variant="success">Keine fehlenden Pflichtfelder – bereit für eHyp home</Badge>
          ) : (
            <div className="flex flex-wrap gap-2">
              {result.missingForEhyp.map((f) => (<Badge key={f} variant="warning">{f}</Badge>))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Datenmodell-Unterschiede</CardTitle></CardHeader>
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
              {result.differences.length === 0 && (
                <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">Keine inhaltlichen Unterschiede – nur Feldbenennungen differieren.</TableCell></TableRow>
              )}
              {result.differences.map((d) => (
                <TableRow key={d.field}>
                  <TableCell className="font-medium">{d.field}</TableCell>
                  <TableCell>{String(d.europace ?? "—")}</TableCell>
                  <TableCell>{String(d.ehyp ?? "—")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <form action={releasePlatform.bind(null, id, "ehyp_home")}>
          <Button variant="success" type="submit" disabled={result.missingForEhyp.length > 0}>
            Status „bereit für eHyp home" setzen
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">eHyp-home-Export (JSON)</CardTitle></CardHeader>
        <CardContent><CopyBlock text={json} label="JSON kopieren" /></CardContent>
      </Card>
    </div>
  );
}
