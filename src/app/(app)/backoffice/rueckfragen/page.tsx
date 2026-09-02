import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuftragsListe } from "@/components/backoffice/auftrags-liste";
import { auftraegeFilterFuer, requireBackoffice } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen } from "@/lib/backoffice/auftraege";
import { sortiereQueue } from "@/lib/backoffice/queue";
import { istAktiv } from "@/lib/backoffice/status";

export const dynamic = "force-dynamic";

export default async function RueckfragenPage() {
  const ctx = await requireBackoffice();
  const jetzt = new Date();
  const zeilen = await ladeAuftragZeilen(auftraegeFilterFuer(ctx));
  const aktive = zeilen.filter((z) => istAktiv(z.status));
  const eingegangen = sortiereQueue(aktive.filter((z) => z.beantworteteRueckfragen > 0), jetzt);
  const wartend = sortiereQueue(aktive.filter((z) => z.offeneRueckfragen > 0 && z.beantworteteRueckfragen === 0), jetzt);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="BaufiDesk Backoffice"
        title="Rückfragen"
        subtitle="Rückfragen an Auftraggeber: was beantwortet ist und auf Ihre Sichtung wartet, und was noch beim Auftraggeber liegt."
      />
      <Card>
        <CardHeader>
          <CardTitle>Rückmeldung eingegangen</CardTitle>
          <CardDescription>
            {eingegangen.length} {eingegangen.length === 1 ? "Auftrag" : "Aufträge"} mit beantworteten Rückfragen - bitte sichten und als erledigt markieren.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <AuftragsListe zeilen={eingegangen} jetzt={jetzt} leerText="Keine neuen Rückmeldungen." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Wartet auf Antwort</CardTitle>
          <CardDescription>
            {wartend.length} {wartend.length === 1 ? "Auftrag" : "Aufträge"} mit offenen Rückfragen beim Auftraggeber.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <AuftragsListe zeilen={wartend} jetzt={jetzt} leerText="Keine Rückfrage wartet auf Antwort." />
        </CardContent>
      </Card>
    </div>
  );
}
