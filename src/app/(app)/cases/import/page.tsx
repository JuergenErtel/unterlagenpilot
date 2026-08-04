import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { getFinLinkClient } from "@/lib/platforms/finlink/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FinLinkImportForm } from "@/components/finlink/finlink-import-form";
import { FinLinkLeadList, type LeadRowData } from "@/components/finlink/finlink-lead-list";

export default async function FinLinkImportPage() {
  const ctx = await requireContext();
  const client = getFinLinkClient();

  let leads: LeadRowData[] | null = null;
  let loadError = false;
  if (client) {
    try {
      const summaries = await client.listLeads();
      // Neueste zuerst; ISO-Strings sortieren lexikografisch korrekt.
      summaries.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      const imported = await prisma.case.findMany({
        where: { organizationId: ctx.organizationId, finlinkId: { in: summaries.map((s) => s.id) } },
        select: { id: true, caseNumber: true, finlinkId: true },
      });
      const byFinlinkId = new Map(imported.map((c) => [c.finlinkId, c]));
      leads = summaries.map((s) => {
        const existing = s.id ? byFinlinkId.get(s.id) : undefined;
        return {
          id: s.id,
          name: [s.vorname, s.nachname].filter(Boolean).join(" ") || "Unbenannter Lead",
          ort: s.ort,
          objektOrt: s.objektOrt,
          finanzierungsart: s.finanzierungsart,
          kaufpreis: s.kaufpreis,
          createdAt: s.createdAt,
          salesState: s.salesState,
          importedCase: existing ? { id: existing.id, caseNumber: existing.caseNumber } : undefined,
        };
      });
    } catch {
      loadError = true;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Empfohlener Startpunkt"
        title="Aus FinLink importieren"
        subtitle="Übernimm einen bestehenden Vorgang aus FinLink – Kundendaten und Objektangaben kommen direkt in BaufiDesk."
      />

      {!client && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            FinLink ist nicht konfiguriert (FINLINK_API_KEY fehlt). Bis dahin kannst du unten eine Lead-ID manuell
            eintragen oder den Fall regulär anlegen.
          </CardContent>
        </Card>
      )}

      {loadError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Die Lead-Liste konnte gerade nicht aus FinLink geladen werden. Bitte später erneut versuchen – oder unten
            eine Lead-ID manuell eintragen.
          </CardContent>
        </Card>
      )}

      {leads && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads aus deinem FinLink-Konto</CardTitle>
            <CardDescription>
              Neueste zuerst. Ein Klick übernimmt Kundendaten, Beschäftigung, Einkommen und Objektangaben als neuen
              Fall.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <FinLinkLeadList leads={leads} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead-ID direkt eingeben</CardTitle>
          <CardDescription>
            Für den Fall, dass du eine Lead-ID (UUID) aus anderer Quelle hast – z.&nbsp;B. aus der FinLink-API.
          </CardDescription>
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
