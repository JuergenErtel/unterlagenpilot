import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuftragsListe } from "@/components/backoffice/auftrags-liste";
import { auftraegeFilterFuer, requireBackoffice } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen } from "@/lib/backoffice/auftraege";
import { sortiereQueue } from "@/lib/backoffice/queue";

export const dynamic = "force-dynamic";

export default async function QualitaetskontrollePage() {
  const ctx = await requireBackoffice();
  const jetzt = new Date();
  const zeilen = await ladeAuftragZeilen(auftraegeFilterFuer(ctx));
  const qc = sortiereQueue(zeilen.filter((z) => z.status === "qualitaetskontrolle"), jetzt);
  const nach = sortiereQueue(zeilen.filter((z) => z.status === "nachbearbeitung"), jetzt);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mein Arbeitstag"
        title="Qualitätskontrolle"
        subtitle="Aufträge, die auf die Freigabe warten - und solche, die aus der Prüfung zurück in die Nachbearbeitung gingen."
      />
      <Card>
        <CardHeader>
          <CardTitle>Wartet auf Freigabe</CardTitle>
          <CardDescription>
            {qc.length} {qc.length === 1 ? "Auftrag" : "Aufträge"} in der Qualitätskontrolle. Vier-Augen-Prinzip: Bearbeiter geben die eigene Arbeit nicht frei.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <AuftragsListe zeilen={qc} jetzt={jetzt} leerText="Kein Auftrag wartet auf die Qualitätskontrolle." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Nachbearbeitung erforderlich</CardTitle>
          <CardDescription>
            {nach.length} {nach.length === 1 ? "Auftrag" : "Aufträge"} mit Rückgabe aus der Prüfung oder Nachbearbeitungswunsch des Auftraggebers.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <AuftragsListe zeilen={nach} jetzt={jetzt} leerText="Keine Nachbearbeitung offen." />
        </CardContent>
      </Card>
    </div>
  );
}
