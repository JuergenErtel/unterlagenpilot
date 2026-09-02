import Link from "next/link";
import { requirePortal } from "@/lib/backoffice/zugriff";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NeuerAuftragForm } from "@/components/portal/neuer-auftrag-form";

export const dynamic = "force-dynamic";

export default async function PortalNeuerAuftrag() {
  const ctx = await requirePortal();
  const partner = ctx.auftraggeber.map((a) => ({ id: a.id, backofficeName: a.backofficeName }));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Neuer Auftrag"
        title="Neuer Auftrag"
        subtitle={
          partner.length === 1
            ? `Sie beauftragen ${partner[0]!.backofficeName}. Die Akte wird beim Backoffice geführt; Sie sehen Fortschritt, Rückfragen und Ergebnis hier im Portal.`
            : "Wählen Sie den Backoffice-Partner und beschreiben Sie den Auftrag. Die Akte wird beim Backoffice geführt."
        }
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/portal/auftraege">Abbrechen</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="p-5 sm:p-6">
          <NeuerAuftragForm partner={partner} />
        </CardContent>
      </Card>
    </div>
  );
}
