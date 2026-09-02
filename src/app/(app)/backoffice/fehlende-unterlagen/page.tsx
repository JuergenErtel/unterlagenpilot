import { PageHeader } from "@/components/ui/page-header";
import { AuftragsListe } from "@/components/backoffice/auftrags-liste";
import { auftraegeFilterFuer, requireBackoffice } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen } from "@/lib/backoffice/auftraege";
import { sortiereQueue } from "@/lib/backoffice/queue";
import { istAktiv } from "@/lib/backoffice/status";

export const dynamic = "force-dynamic";

export default async function FehlendeUnterlagenPage() {
  const ctx = await requireBackoffice();
  const jetzt = new Date();
  const zeilen = await ladeAuftragZeilen(auftraegeFilterFuer(ctx));
  const auswahl = sortiereQueue(
    zeilen.filter((z) => istAktiv(z.status) && (z.status === "wartet_auf_unterlagen" || z.fehlendeUnterlagen > 0)),
    jetzt
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Klärungsbedarf"
        title="Fehlende Unterlagen"
        subtitle="Aktive Aufträge, deren Akte offene Positionen hat oder die auf Unterlagen warten. Die Nachforderung läuft über den Unterlagen-Arbeitsplatz der Akte."
      />
      <div className="rounded-lg border bg-card card-elevated">
        <div className="border-b px-4 py-3 text-sm text-muted-foreground">
          {auswahl.length} {auswahl.length === 1 ? "Auftrag" : "Aufträge"}
        </div>
        <AuftragsListe zeilen={auswahl} jetzt={jetzt} leerText="In keiner aktiven Akte fehlen Unterlagen." />
      </div>
    </div>
  );
}
