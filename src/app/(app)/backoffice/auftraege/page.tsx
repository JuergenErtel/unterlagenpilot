import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { AuftragsListe } from "@/components/backoffice/auftrags-liste";
import { QueueFilterLeiste } from "@/components/backoffice/queue-filter";
import { auftraegeFilterFuer, requireBackoffice } from "@/lib/backoffice/zugriff";
import { ladeAuftraggeberListe, ladeAuftragZeilen, ladeBackofficeTeam } from "@/lib/backoffice/auftraege";
import { filtereQueue, liesQueueFilter, sortiereQueue } from "@/lib/backoffice/queue";

export const dynamic = "force-dynamic";

export default async function AuftraegePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireBackoffice();
  const jetzt = new Date();
  const filter = liesQueueFilter(await searchParams);
  if (!filter.status) filter.status = "alle";
  const [zeilen, team, auftraggeber] = await Promise.all([
    ladeAuftragZeilen(auftraegeFilterFuer(ctx)),
    ladeBackofficeTeam(ctx.organizationId),
    ladeAuftraggeberListe(ctx.organizationId),
  ]);
  const ergebnis = sortiereQueue(filtereQueue(zeilen, filter, jetzt), jetzt);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="BaufiDesk Backoffice"
        title="Alle Aufträge"
        subtitle="Jeder Auftrag, den Sie sehen dürfen - aktive wie abgeschlossene."
        actions={
          ctx.backofficeRolle === "manager" ? (
            <Button asChild size="sm">
              <Link href="/backoffice/auftraege/neu">
                <Plus />
                Neuer Auftrag
              </Link>
            </Button>
          ) : undefined
        }
      />
      <QueueFilterLeiste
        filter={filter}
        standardStatus="alle"
        bearbeiter={team.map((t) => ({ id: t.id, name: t.name }))}
        auftraggeber={auftraggeber.map((a) => ({ id: a.id, name: a.kurzname ?? a.name }))}
      />
      <div className="rounded-lg border bg-card card-elevated">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {ergebnis.length} {ergebnis.length === 1 ? "Auftrag" : "Aufträge"}
          </span>
        </div>
        <AuftragsListe
          zeilen={ergebnis}
          jetzt={jetzt}
          leerText={
            zeilen.length === 0
              ? "Noch kein Auftrag angelegt. Aufträge entstehen über das Portal, die Übergabe aus dem Vertrieb oder über „Neuer Auftrag“."
              : "Kein Auftrag passt zu diesem Filter."
          }
        />
      </div>
    </div>
  );
}
