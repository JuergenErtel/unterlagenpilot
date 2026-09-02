import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireBackofficeManager } from "@/lib/backoffice/zugriff";
import { ladeAuftraggeberListe } from "@/lib/backoffice/auftraege";
import { AuftragAnlegenForm } from "@/components/backoffice/auftrag-anlegen-form";

export const dynamic = "force-dynamic";

export default async function NeuerAuftragPage() {
  const ctx = await requireBackofficeManager();
  const auftraggeber = (await ladeAuftraggeberListe(ctx.organizationId)).filter(
    (a) => a.aktiv && a.abrechnungsmodell !== "intern"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="BaufiDesk Backoffice"
        title="Neuer Auftrag"
        subtitle="Auftraggeber, Antragsteller und Leistungsumfang. Es werden keine Vertriebsdaten benötigt."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/backoffice/auftraege"><ArrowLeft /> Zu den Aufträgen</Link>
          </Button>
        }
      />
      {auftraggeber.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm">
            <p>Es gibt noch keinen aktiven Auftraggeber.</p>
            <Button asChild size="sm"><Link href="/backoffice/auftraggeber/neu">Auftraggeber anlegen</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <AuftragAnlegenForm
              auftraggeber={auftraggeber.map((a) => ({
                id: a.id,
                name: a.kurzname ? `${a.name} (${a.kurzname})` : a.name,
                kontakte: a.kontakte.map((k) => ({ id: k.id, name: k.name, email: k.email })),
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
