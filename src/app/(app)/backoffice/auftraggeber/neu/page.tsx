import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireBackofficeManager } from "@/lib/backoffice/zugriff";
import { AuftraggeberForm } from "@/components/backoffice/auftraggeber-formulare";

export const dynamic = "force-dynamic";

export default async function NeuerAuftraggeberPage() {
  await requireBackofficeManager();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Auftraggeber"
        title="Neuer Auftraggeber"
        subtitle="Stammdaten, Abrechnungsmodell und Frist. Kontakte und die Portal-Verknüpfung folgen auf der Detailseite."
        actions={<Button asChild variant="outline" size="sm"><Link href="/backoffice/auftraggeber"><ArrowLeft /> Zur Liste</Link></Button>}
      />
      <Card><CardContent className="pt-6"><AuftraggeberForm /></CardContent></Card>
    </div>
  );
}
