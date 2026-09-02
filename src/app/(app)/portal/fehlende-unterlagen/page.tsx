import Link from "next/link";
import { requirePortal, portalAuftraegeFilter } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen } from "@/lib/backoffice/auftraege";
import { istAktiv } from "@/lib/backoffice/status";
import { auftragsartLabel } from "@/lib/backoffice/leistungen";
import { datumText } from "@/lib/backoffice/anzeige";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusMarke } from "@/components/backoffice/status-anzeigen";
import { fehltText } from "@/components/portal/hilfen";

export const dynamic = "force-dynamic";

export default async function PortalFehlendeUnterlagen() {
  const ctx = await requirePortal();
  const alle = await ladeAuftragZeilen(portalAuftraegeFilter(ctx));
  const zeilen = alle.filter((z) => istAktiv(z.status) && (z.fehlendeUnterlagen > 0 || z.status === "wartet_auf_unterlagen"));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Auftraggeberportal"
        title="Fehlende Unterlagen"
        subtitle={
          zeilen.length === 0
            ? "In keinem laufenden Auftrag fehlen Unterlagen."
            : `${zeilen.length} ${zeilen.length === 1 ? "Auftrag wartet" : "Aufträge warten"} auf Unterlagen. Sie laden direkt im Auftrag hoch oder geben dem Antragsteller einen Upload-Link.`
        }
      />

      {zeilen.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">Alle angeforderten Unterlagen liegen vor.</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/portal/auftraege">Zu den Aufträgen</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {zeilen.map((z) => (
            <li key={z.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/portal/auftraege/${z.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    {z.auftragsnummer}
                  </Link>
                  <div className="truncate text-sm text-muted-foreground">{z.aktenbezeichnung ?? auftragsartLabel(z.auftragsart)}</div>
                </div>
                <StatusMarke status={z.status} pausiert={Boolean(z.pausiertSeit)} portal />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Fehlt</dt>
                <dd className="font-medium text-[hsl(var(--warning))]">{z.fehlendeUnterlagen > 0 ? fehltText(z.fehlendeUnterlagen) : "Nachforderung läuft"}</dd>
                <dt className="text-muted-foreground">Zugesagte Frist</dt>
                <dd className="tabular">{datumText(z.faelligAm)}</dd>
                {z.wartegrund ? (
                  <>
                    <dt className="text-muted-foreground">Hinweis</dt>
                    <dd>{z.wartegrund}</dd>
                  </>
                ) : null}
              </dl>
              <div className="mt-3">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/portal/auftraege/${z.id}#unterlagen`}>Unterlagen nachreichen</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
