import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AktionFormular } from "@/components/backoffice/aktion-formular";
import { prisma } from "@/lib/db";
import { slaVorgabeAction } from "@/lib/actions/backoffice";
import { requireBackofficeManager } from "@/lib/backoffice/zugriff";
import { AUFTRAGSARTEN, ERGEBNIS_LABELS, LEISTUNGSBAUSTEINE, leistungsLabel } from "@/lib/backoffice/leistungen";

export const dynamic = "force-dynamic";

export default async function KonfigurationPage() {
  const ctx = await requireBackofficeManager();
  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { backofficeSlaTage: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Verwaltung"
        title="Konfiguration"
        subtitle="Fristvorgabe und Leistungskatalog des Backoffice. Das Produkt selbst wird durch den Plattformbetreiber je Organisation aktiviert."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fristvorgabe (SLA)</CardTitle>
            <CardDescription>
              Werktage vom Eingang bis zur Fälligkeit, wenn beim Auftraggeber keine eigene Frist vereinbart ist. Wochenenden zählen nicht, Feiertage bewusst schon.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AktionFormular aktion={slaVorgabeAction} submitLabel="Speichern" pendingLabel="Speichere …" erfolg="Fristvorgabe gespeichert.">
              <div className="space-y-1.5">
                <Label htmlFor="backofficeSlaTage">Werktage bis zur Fälligkeit</Label>
                <Input
                  id="backofficeSlaTage"
                  name="backofficeSlaTage"
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={org?.backofficeSlaTage ?? 3}
                  className="w-32"
                  required
                />
                <p className="text-xs text-muted-foreground">Gilt für neue Aufträge. Bestehende Fristen bleiben, wie sie sind.</p>
              </div>
            </AktionFormular>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Freischaltung</CardTitle>
            <CardDescription>BaufiDesk Backoffice ist ein eigenes Produkt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <Badge variant="success">Aktiviert</Badge>
              <span className="ml-2 text-muted-foreground">für {ctx.organizationName}</span>
            </p>
            <p className="text-muted-foreground">
              Aktiviert durch den Plattformbetreiber. Rollen vergeben Sie unter „Team“, Auftraggeber und Kontingente unter „Auftraggeber“.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Auftragsarten</CardTitle>
          <CardDescription>Der Katalog, aus dem Auftraggeber und Manager wählen. Jede Auftragsart belegt Leistungsbausteine vor.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Auftragsart</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead>Vorbelegte Leistungen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {AUFTRAGSARTEN.map((a) => (
                  <TableRow key={a.key}>
                    <TableCell className="whitespace-nowrap font-medium">{a.label}</TableCell>
                    <TableCell className="text-muted-foreground">{a.beschreibung}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {a.leistungen.map((l) => (
                          <Badge key={l} variant="neutral">
                            {leistungsLabel(l)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leistungsbausteine</CardTitle>
          <CardDescription>Was das Backoffice leistet und welche Ergebnisse der Auftraggeber nach der Übergabe erhält.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leistung</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead>Ergebnisse</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {LEISTUNGSBAUSTEINE.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell className="whitespace-nowrap font-medium">{l.label}</TableCell>
                    <TableCell className="text-muted-foreground">{l.beschreibung}</TableCell>
                    <TableCell className="text-sm">
                      {l.ergebnisse.length === 0 ? (
                        <span className="text-muted-foreground">nach Absprache</span>
                      ) : (
                        l.ergebnisse.map((e) => ERGEBNIS_LABELS[e]).join(", ")
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
