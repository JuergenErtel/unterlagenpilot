import { prisma } from "@/lib/db";
import { requirePortal } from "@/lib/backoffice/zugriff";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KontaktEntfernenButton, KontaktForm } from "@/components/portal/portal-formulare";

export const dynamic = "force-dynamic";

export default async function PortalOrganisation() {
  const ctx = await requirePortal();
  const nutzer = ctx.istAdmin
    ? await prisma.user.findMany({
        where: { organizationId: ctx.organizationId, active: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Auftraggeberportal"
        title="Organisation und Mitarbeiter"
        subtitle={`${ctx.organizationName} · Wer aus Ihrem Haus Aufträge sieht und Rückfragen beantwortet.${
          ctx.istAdmin ? "" : " Änderungen nimmt ein Administrator Ihrer Organisation vor."
        }`}
      />

      <div className="grid gap-6">
        {ctx.auftraggeber.map((a) => {
          const aktive = a.kontakte.filter((k) => k.aktiv);
          const gebundene = new Set(aktive.map((k) => k.userId).filter((id): id is string => Boolean(id)));
          const kandidaten = nutzer.filter((u) => !gebundene.has(u.id));
          return (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle>{a.backofficeName}</CardTitle>
                <CardDescription>
                  Backoffice-Partner · Sie sind dort als „{a.name}“ geführt.
                  {a.antragstellerKontaktErlaubt ? " Das Backoffice darf Antragsteller direkt kontaktieren." : " Der Kontakt zum Antragsteller läuft über Sie."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>E-Mail</TableHead>
                        <TableHead>Sieht</TableHead>
                        {ctx.istAdmin ? <TableHead className="text-right">Aktion</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aktive.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={ctx.istAdmin ? 4 : 3} className="text-center text-sm text-muted-foreground">
                            Noch kein Mitarbeiter hinterlegt. Administratoren sehen alle Aufträge auch ohne Eintrag.
                          </TableCell>
                        </TableRow>
                      ) : (
                        aktive.map((k) => (
                          <TableRow key={k.id}>
                            <TableCell className="font-medium">
                              {k.name}
                              {k.userId === ctx.userId ? <span className="ml-2 text-xs text-muted-foreground">(Sie)</span> : null}
                              {!k.userId ? <span className="ml-2 text-xs text-muted-foreground">(ohne Login)</span> : null}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{k.email ?? "—"}</TableCell>
                            <TableCell>{k.darfAlleAuftraegeSehen ? "Alle Aufträge" : "Nur eigene Aufträge"}</TableCell>
                            {ctx.istAdmin ? (
                              <TableCell className="text-right">
                                <KontaktEntfernenButton auftraggeberId={a.id} kontaktId={k.id} />
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {ctx.istAdmin ? (
                  <div className="space-y-2 border-t pt-5">
                    <h3 className="text-sm font-medium">Mitarbeiter hinzufügen</h3>
                    <p className="text-xs text-muted-foreground">
                      Nur Nutzer Ihrer Organisation. Wer „alle Aufträge“ nicht darf, sieht ausschließlich die Aufträge, die er selbst erteilt hat.
                    </p>
                    <KontaktForm auftraggeberId={a.id} nutzer={kandidaten} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
