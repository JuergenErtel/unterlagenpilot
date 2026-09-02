import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { requirePortal, portalAuftraegeFilter } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen, type AuftragZeile } from "@/lib/backoffice/auftraege";
import { istAktiv, wartetAufAuftraggeber } from "@/lib/backoffice/status";
import { auftragsartLabel } from "@/lib/backoffice/leistungen";
import { datumText, datumZeitText } from "@/lib/backoffice/anzeige";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusMarke } from "@/components/backoffice/status-anzeigen";
import { fehltText } from "@/components/portal/hilfen";

export const dynamic = "force-dynamic";

function Kachel({ titel, wert, href, ton }: { titel: string; wert: number; href: string; ton?: "warnung" | "bereit" }) {
  return (
    <Link
      href={href}
      className="group rounded-lg border bg-card p-4 transition-colors hover:border-foreground/25"
    >
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titel}</div>
      <div
        className={`display mt-2 text-3xl tabular ${
          wert > 0 && ton === "warnung" ? "text-[hsl(var(--warning))]" : wert > 0 && ton === "bereit" ? "text-success" : "text-foreground"
        }`}
      >
        {wert}
      </div>
      <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
        Anzeigen <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}

function AuftragZeileKompakt({ z, grund }: { z: AuftragZeile; grund: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <Link href={`/portal/auftraege/${z.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {z.auftragsnummer}
        </Link>
        <span className="ml-2 text-sm text-muted-foreground">{z.aktenbezeichnung ?? auftragsartLabel(z.auftragsart)}</span>
        <div className="text-xs text-muted-foreground">{grund}</div>
      </div>
      <StatusMarke status={z.status} pausiert={Boolean(z.pausiertSeit)} portal />
    </li>
  );
}

export default async function PortalUebersicht() {
  const ctx = await requirePortal();
  const zeilen = await ladeAuftragZeilen(portalAuftraegeFilter(ctx));

  const aktiv = zeilen.filter((z) => istAktiv(z.status));
  const inBearbeitung = aktiv.filter((z) => !wartetAufAuftraggeber(z.status) && z.status !== "uebergeben");
  const rueckmeldung = aktiv.filter((z) => wartetAufAuftraggeber(z.status));
  const ergebnisse = zeilen.filter((z) => z.status === "uebergeben");
  const abgeschlossen = zeilen.filter((z) => z.status === "abgeschlossen");

  const gefragt = aktiv
    .filter((z) => z.offeneRueckfragen > 0 || z.fehlendeUnterlagen > 0 || wartetAufAuftraggeber(z.status))
    .slice(0, 8);
  const zuletzt = [...zeilen].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 6);

  const partnerNamen = Array.from(new Set(ctx.auftraggeber.map((a) => a.backofficeName)));
  const begruessung =
    partnerNamen.length === 1
      ? `Ihr Backoffice-Partner ${partnerNamen[0]} bearbeitet Ihre Aufträge. Hier sehen Sie, wo Ihre Mitwirkung gefragt ist und welche Ergebnisse bereitstehen.`
      : `Ihre Backoffice-Partner ${partnerNamen.join(", ")} bearbeiten Ihre Aufträge. Hier sehen Sie, wo Ihre Mitwirkung gefragt ist und welche Ergebnisse bereitstehen.`;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Auftraggeberportal"
        title={`Guten Tag, ${ctx.userName}`}
        subtitle={begruessung}
        actions={
          <Button asChild size="sm">
            <Link href="/portal/auftraege/neu">
              <Plus />
              Neuer Auftrag
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kachel titel="In Bearbeitung" wert={inBearbeitung.length} href="/portal/auftraege?status=aktiv" />
        <Kachel titel="Ihre Rückmeldung wird benötigt" wert={rueckmeldung.length} href="/portal/rueckfragen" ton="warnung" />
        <Kachel titel="Ergebnisse verfügbar" wert={ergebnisse.length} href="/portal/ergebnisse" ton="bereit" />
        <Kachel titel="Abgeschlossen" wert={abgeschlossen.length} href="/portal/auftraege?status=abgeschlossen" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Jetzt gefragt</CardTitle>
            <CardDescription>Aufträge, bei denen das Backoffice auf Sie wartet.</CardDescription>
          </CardHeader>
          <CardContent>
            {gefragt.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nichts offen. Das Backoffice hat alles, was es braucht.</p>
            ) : (
              <ul className="divide-y">
                {gefragt.map((z) => {
                  const gruende: string[] = [];
                  if (z.offeneRueckfragen > 0) gruende.push(`${z.offeneRueckfragen} offene Rückfrage${z.offeneRueckfragen === 1 ? "" : "n"}`);
                  if (z.fehlendeUnterlagen > 0) gruende.push(fehltText(z.fehlendeUnterlagen));
                  if (gruende.length === 0 && z.wartegrund) gruende.push(z.wartegrund);
                  return <AuftragZeileKompakt key={z.id} z={z} grund={gruende.join(" · ") || "Rückmeldung erbeten"} />;
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Zuletzt aktualisiert</CardTitle>
            <CardDescription>Die jüngsten Bewegungen in Ihren Aufträgen.</CardDescription>
          </CardHeader>
          <CardContent>
            {zuletzt.length === 0 ? (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Noch keine Aufträge. Erteilen Sie den ersten Auftrag an Ihr Backoffice.</p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/portal/auftraege/neu">Neuer Auftrag</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {zuletzt.map((z) => (
                  <AuftragZeileKompakt
                    key={z.id}
                    z={z}
                    grund={`Aktualisiert ${datumZeitText(z.updatedAt)}${z.faelligAm ? ` · Frist ${datumText(z.faelligAm)}` : ""}`}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
