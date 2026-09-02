import { PageHeader } from "@/components/ui/page-header";
import { AuftragsListe } from "@/components/backoffice/auftrags-liste";
import { QueueFilterLeiste } from "@/components/backoffice/queue-filter";
import { auftraegeFilterFuer, requireBackoffice } from "@/lib/backoffice/zugriff";
import { ladeAuftraggeberListe, ladeAuftragZeilen, ladeBackofficeTeam } from "@/lib/backoffice/auftraege";
import { filtereQueue, liesQueueFilter, sortiereQueue } from "@/lib/backoffice/queue";

export const dynamic = "force-dynamic";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireBackoffice();
  const jetzt = new Date();
  const filter = liesQueueFilter(await searchParams);
  const [zeilen, team, auftraggeber] = await Promise.all([
    ladeAuftragZeilen(auftraegeFilterFuer(ctx)),
    ladeBackofficeTeam(ctx.organizationId),
    ladeAuftraggeberListe(ctx.organizationId),
  ]);
  const ergebnis = sortiereQueue(filtereQueue(zeilen, filter, jetzt), jetzt);
  const darfUebernehmen = ctx.backofficeRolle === "bearbeiter" || ctx.backofficeRolle === "manager";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="BaufiDesk Backoffice"
        title="Bearbeitungsqueue"
        subtitle="Überfällige und heute fällige Aufträge zuerst, dann nach Priorität und Frist. Pausierte und wartende am Ende."
      />
      <QueueFilterLeiste
        filter={filter}
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
          uebernehmen={darfUebernehmen}
          leerText="Kein Auftrag passt zu diesem Filter. Filter zurücksetzen oder einen anderen Status wählen."
        />
      </div>
    </div>
  );
}
