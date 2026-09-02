import { PageHeader } from "@/components/ui/page-header";
import { AuftragsListe } from "@/components/backoffice/auftrags-liste";
import { auftraegeFilterFuer, requireBackoffice } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen } from "@/lib/backoffice/auftraege";
import { sortiereQueue } from "@/lib/backoffice/queue";
import { istAktiv } from "@/lib/backoffice/status";

export const dynamic = "force-dynamic";

export default async function DokumentenpruefungPage() {
  const ctx = await requireBackoffice();
  const jetzt = new Date();
  const zeilen = await ladeAuftragZeilen(auftraegeFilterFuer(ctx));
  const auswahl = sortiereQueue(
    zeilen.filter((z) => istAktiv(z.status) && z.ungepruefteDokumente > 0),
    jetzt
  );
  const gesamt = auswahl.reduce((acc, z) => acc + z.ungepruefteDokumente, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Klärungsbedarf"
        title="Dokumentenprüfung"
        subtitle="Aktive Aufträge mit Dokumenten, über die noch nicht entschieden wurde. Die Auftragsnummer führt direkt in den Unterlagen-Arbeitsplatz der Akte."
      />
      <div className="rounded-lg border bg-card card-elevated">
        <div className="border-b px-4 py-3 text-sm text-muted-foreground">
          {auswahl.length} {auswahl.length === 1 ? "Auftrag" : "Aufträge"} · {gesamt} {gesamt === 1 ? "Dokument" : "Dokumente"} zu prüfen
        </div>
        <AuftragsListe zeilen={auswahl} jetzt={jetzt} ziel="unterlagen" leerText="Alle Dokumente der aktiven Aufträge sind geprüft." />
      </div>
    </div>
  );
}
