import { PageHeader } from "@/components/ui/page-header";
import { TabellenContainer } from "@/components/ui/flaechen";
import { AuftragsListe } from "@/components/backoffice/auftrags-liste";
import { QueueFilterLeiste } from "@/components/backoffice/queue-filter";
import { Arbeitsfokus } from "@/components/backoffice/arbeitsfokus";
import { auftraegeFilterFuer, requireBackoffice } from "@/lib/backoffice/zugriff";
import { ladeAuftraggeberListe, ladeAuftragZeilen, ladeBackofficeTeam } from "@/lib/backoffice/auftraege";
import { filtereQueue, liesQueueFilter, sortiereQueue } from "@/lib/backoffice/queue";
import { fokusAuftrag } from "@/lib/backoffice/fokus";

export const dynamic = "force-dynamic";

/**
 * "Jetzt bearbeiten" - der taegliche Arbeitsplatz. Oben der eine Auftrag,
 * der dran ist; darunter die Reihe der uebrigen in der Reihenfolge, in der
 * sie dran kommen. Filter nur, wenn jemand gezielt sucht.
 */
export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireBackoffice();
  const jetzt = new Date();
  const params = await searchParams;
  const filter = liesQueueFilter(params);
  const gefiltert = Object.keys(params).length > 0;
  const [zeilen, team, auftraggeber] = await Promise.all([
    ladeAuftragZeilen(auftraegeFilterFuer(ctx)),
    ladeBackofficeTeam(ctx.organizationId),
    ladeAuftraggeberListe(ctx.organizationId),
  ]);
  const ergebnis = sortiereQueue(filtereQueue(zeilen, filter, jetzt), jetzt);
  const darfUebernehmen = ctx.backofficeRolle === "bearbeiter" || ctx.backofficeRolle === "manager";
  const fokus = gefiltert ? null : fokusAuftrag(ergebnis, jetzt);
  const rest = fokus ? ergebnis.filter((z) => z.id !== fokus.id) : ergebnis;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mein Arbeitstag"
        title="Jetzt bearbeiten"
        subtitle="Überfällig und heute fällig zuerst, dann nach Priorität und Frist. Pausierte und wartende Aufträge stehen am Ende."
      />

      {fokus && <Arbeitsfokus auftrag={fokus} jetzt={jetzt} weitere={rest.length} />}

      <details open={gefiltert} className="group">
        <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-2 rounded-md border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Filtern und suchen</span>
          <span className="hidden group-open:inline">Filter ausblenden</span>
        </summary>
        <div className="mt-3">
          <QueueFilterLeiste
            filter={filter}
            bearbeiter={team.map((t) => ({ id: t.id, name: t.name }))}
            auftraggeber={auftraggeber.map((a) => ({ id: a.id, name: a.kurzname ?? a.name }))}
          />
        </div>
      </details>

      <TabellenContainer
        titel={fokus ? "Danach" : "Aufträge"}
        zaehler={`${rest.length} ${rest.length === 1 ? "Auftrag" : "Aufträge"}${gefiltert ? " im Filter" : ""}`}
      >
        <AuftragsListe
          zeilen={rest}
          jetzt={jetzt}
          uebernehmen={darfUebernehmen}
          leerText={
            gefiltert
              ? "Kein Auftrag passt zu diesem Filter. Filter zurücksetzen oder einen anderen Status wählen."
              : fokus
                ? "Sonst wartet nichts – nach diesem Auftrag ist die Reihe leer."
                : "Nichts wartet auf das Backoffice. Neue Aufträge erscheinen hier, sobald sie eingehen."
          }
        />
      </TabellenContainer>
    </div>
  );
}
