import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePortal, portalAuftraegeFilter } from "@/lib/backoffice/zugriff";
import { auftragsartLabel } from "@/lib/backoffice/leistungen";
import { datumText } from "@/lib/backoffice/anzeige";
import type { BackofficeStatus } from "@/lib/domain/enums";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusMarke } from "@/components/backoffice/status-anzeigen";

export const dynamic = "force-dynamic";

export default async function PortalErgebnisse() {
  const ctx = await requirePortal();
  const zeilen = await prisma.backofficeAuftrag.findMany({
    where: { AND: [portalAuftraegeFilter(ctx), { uebergebenAm: { not: null } }] },
    select: {
      id: true,
      auftragsnummer: true,
      aktenbezeichnung: true,
      auftragsart: true,
      status: true,
      pausiertSeit: true,
      uebergebenAm: true,
      abgenommenAm: true,
    },
    orderBy: { uebergebenAm: "desc" },
    take: 200,
  });
  const offen = zeilen.filter((z) => !z.abgenommenAm).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Auftraggeberportal"
        title="Ergebnisse"
        subtitle={
          zeilen.length === 0
            ? "Noch kein Ergebnis übergeben."
            : offen > 0
              ? `${offen} ${offen === 1 ? "Ergebnis wartet" : "Ergebnisse warten"} auf Ihre Abnahme.`
              : "Alle übergebenen Ergebnisse sind abgenommen."
        }
      />

      {zeilen.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">Sobald das Backoffice einen Auftrag übergibt, finden Sie das Ergebnis hier.</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/portal/auftraege">Zu den Aufträgen</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Auftrag</TableHead>
                <TableHead>Akte</TableHead>
                <TableHead>Auftragsart</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Übergeben</TableHead>
                <TableHead>Abnahme</TableHead>
                <TableHead className="text-right">Ergebnis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zeilen.map((z) => (
                <TableRow key={z.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/portal/auftraege/${z.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {z.auftragsnummer}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate">{z.aktenbezeichnung ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{auftragsartLabel(z.auftragsart)}</TableCell>
                  <TableCell>
                    <StatusMarke status={z.status as BackofficeStatus} pausiert={Boolean(z.pausiertSeit)} portal />
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap">{datumText(z.uebergebenAm)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {z.abgenommenAm ? (
                      <span className="text-success">Abgenommen {datumText(z.abgenommenAm)}</span>
                    ) : (
                      <span className="text-[hsl(var(--warning))]">Abnahme offen</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/portal/auftraege/${z.id}#ergebnis`}>Ergebnis öffnen</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
