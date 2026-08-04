import Link from "next/link";
import { Download, ArrowRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FinLinkImportForm } from "@/components/finlink/finlink-import-form";

export default function FinLinkImportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Empfohlener Startpunkt"
        title="Aus FinLink importieren"
        subtitle="Übernimm einen bestehenden Vorgang aus FinLink – Kundendaten und Objektangaben kommen direkt in BaufiDesk."
      />

      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            Der Import läuft live über die FinLink-Partner-API. Trage die Lead-ID (UUID) aus FinLink ein – Kundendaten,
            Beschäftigung, Einkommen und Objektangaben werden direkt als neuer Fall übernommen.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vorgang übernehmen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FinLinkImportForm />
          <p className="text-xs text-muted-foreground">
            BaufiDesk lädt den Vorgang über die Partner-API und legt den Fall an. Bereits importierte Vorgänge werden
            erkannt und nicht doppelt angelegt.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm">
            <div className="font-medium">Lieber direkt loslegen?</div>
            <div className="text-muted-foreground">Lege den Fall manuell an und sammle die Unterlagen per Upload-Link.</div>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link href="/cases/new"><Plus />Neuen Fall anlegen</Link></Button>
            <Button asChild variant="ghost"><Link href="/connections">Verbindungen<ArrowRight /></Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
