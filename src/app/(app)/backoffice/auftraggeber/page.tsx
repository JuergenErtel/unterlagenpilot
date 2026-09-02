import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireBackoffice } from "@/lib/backoffice/zugriff";
import { ladeAuftraggeberListe } from "@/lib/backoffice/auftraege";
import { BACKOFFICE_ABRECHNUNGSMODELL_LABELS } from "@/lib/domain/enums";

export const dynamic = "force-dynamic";

export default async function AuftraggeberListePage() {
  const ctx = await requireBackoffice();
  const liste = await ladeAuftraggeberListe(ctx.organizationId);
  const manager = ctx.backofficeRolle === "manager";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Auftraggeber"
        title="Auftraggeber"
        subtitle="Die Vermittler und Vermittlungsunternehmen, für die dieses Backoffice arbeitet. Der Antragsteller steht nie hier, sondern an der Akte."
        actions={manager ? <Button asChild size="sm"><Link href="/backoffice/auftraggeber/neu"><Plus /> Neuer Auftraggeber</Link></Button> : undefined}
      />
      <div className="rounded-lg border bg-card card-elevated">
        {liste.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Noch kein Auftraggeber. {manager ? "Legen Sie den ersten an." : "Ein Manager legt Auftraggeber an."}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Modell</TableHead>
                  <TableHead>Kontingent</TableHead>
                  <TableHead>Portal</TableHead>
                  <TableHead>Kontakte</TableHead>
                  <TableHead className="text-right">Aufträge</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liste.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/backoffice/auftraggeber/${a.id}`} className="font-medium text-primary underline-offset-4 hover:underline">{a.name}</Link>
                      {a.kurzname && <span className="ml-2 text-xs text-muted-foreground">{a.kurzname}</span>}
                      {a.city && <div className="text-xs text-muted-foreground">{a.city}</div>}
                    </TableCell>
                    <TableCell>{BACKOFFICE_ABRECHNUNGSMODELL_LABELS[a.abrechnungsmodell]}</TableCell>
                    <TableCell className="tabular">{a.kontingentMonatlich != null ? `${a.kontingentMonatlich} / Monat` : "—"}</TableCell>
                    <TableCell>{a.organization ? <Badge variant="success">{a.organization.name}</Badge> : <span className="text-xs text-muted-foreground">nicht verknüpft</span>}</TableCell>
                    <TableCell className="tabular">{a.kontakte.length}</TableCell>
                    <TableCell className="text-right tabular">{a._count.auftraege}</TableCell>
                    <TableCell>{a.aktiv ? <Badge variant="neutral">aktiv</Badge> : <Badge variant="destructive">inaktiv</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
