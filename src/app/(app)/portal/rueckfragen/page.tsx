import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePortal, portalAuftraegeFilter } from "@/lib/backoffice/zugriff";
import { datumZeitText } from "@/lib/backoffice/anzeige";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RueckfrageAntwortForm } from "@/components/portal/portal-formulare";

export const dynamic = "force-dynamic";

export default async function PortalRueckfragen() {
  const ctx = await requirePortal();
  const filter = portalAuftraegeFilter(ctx);
  const [offene, beantwortete] = await Promise.all([
    prisma.backofficeRueckfrage.findMany({
      where: { status: "offen", auftrag: filter },
      include: { auftrag: { select: { id: true, auftragsnummer: true, aktenbezeichnung: true } } },
      orderBy: { gestelltAm: "asc" },
    }),
    prisma.backofficeRueckfrage.findMany({
      where: { status: { in: ["beantwortet", "erledigt"] }, auftrag: filter },
      include: { auftrag: { select: { id: true, auftragsnummer: true, aktenbezeichnung: true } } },
      orderBy: { beantwortetAm: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Auftraggeberportal"
        title="Rückfragen"
        subtitle={
          offene.length === 0
            ? "Keine offene Rückfrage. Das Backoffice hat alles, was es braucht."
            : `${offene.length} ${offene.length === 1 ? "Rückfrage wartet" : "Rückfragen warten"} auf Ihre Antwort. Solange bleibt der jeweilige Auftrag stehen.`
        }
      />

      <section className="space-y-3">
        <h2 className="display text-base">Offen</h2>
        {offene.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Nichts zu beantworten.</p>
        ) : (
          <div className="grid gap-4">
            {offene.map((r) => (
              <Card key={r.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <CardTitle>{r.betreff}</CardTitle>
                    <Link href={`/portal/auftraege/${r.auftrag.id}`} className="text-xs text-primary underline-offset-4 hover:underline">
                      {r.auftrag.auftragsnummer}
                      {r.auftrag.aktenbezeichnung ? ` · ${r.auftrag.aktenbezeichnung}` : ""}
                    </Link>
                  </div>
                  <CardDescription>Gestellt {datumZeitText(r.gestelltAm)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="whitespace-pre-line text-sm">{r.frage}</p>
                  <RueckfrageAntwortForm auftragId={r.auftrag.id} rueckfrageId={r.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {beantwortete.length > 0 ? (
        <section className="space-y-3">
          <h2 className="display text-base">Beantwortet</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {beantwortete.map((r) => (
              <li key={r.id} className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{r.betreff}</span>
                  <Link href={`/portal/auftraege/${r.auftrag.id}`} className="text-xs text-primary underline-offset-4 hover:underline">
                    {r.auftrag.auftragsnummer}
                  </Link>
                </div>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{r.frage}</p>
                <p className="whitespace-pre-line rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Ihre Antwort · {datumZeitText(r.beantwortetAm)}</span>
                  <br />
                  {r.antwort}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
