import Link from "next/link";
import { Plus, ArrowRight, FilePlus2, Inbox } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePortal, portalAuftraegeFilter } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen, type AuftragZeile } from "@/lib/backoffice/auftraege";
import { istAktiv, wartetAufAuftraggeber } from "@/lib/backoffice/status";
import { auftragsartLabel } from "@/lib/backoffice/leistungen";
import { berechneKontingent, vorperiode, type KontingentEreignisRoh } from "@/lib/backoffice/kontingent";
import { periodeVon } from "@/lib/backoffice/sla";
import { datumText, datumZeitText } from "@/lib/backoffice/anzeige";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiGruppe, KpiKarte, LeerZustand } from "@/components/ui/flaechen";
import { StatusMarke } from "@/components/backoffice/status-anzeigen";
import { fehltText } from "@/components/portal/hilfen";
import type { BackofficeAbrechnungsmodell } from "@/lib/domain/enums";

export const dynamic = "force-dynamic";

function AuftragZeileKompakt({ z, grund }: { z: AuftragZeile; grund: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <Link href={`/portal/auftraege/${z.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
          {z.aktenbezeichnung ?? auftragsartLabel(z.auftragsart)}
        </Link>
        <span className="ml-2 font-mono text-xs tabular text-muted-foreground">{z.auftragsnummer}</span>
        <div className="text-xs text-muted-foreground">{grund}</div>
      </div>
      <StatusMarke status={z.status} pausiert={Boolean(z.pausiertSeit)} portal />
    </li>
  );
}

/**
 * Die Portal-Uebersicht beantwortet in Sekunden: Wo ist meine Mitwirkung
 * gefragt, was ist fertig, wie viel Kontingent bleibt. Kein internes
 * Dashboard, keine Bearbeiterzahlen.
 */
export default async function PortalUebersicht() {
  const ctx = await requirePortal();
  const jetzt = new Date();
  const zeilen = await ladeAuftragZeilen(portalAuftraegeFilter(ctx));
  const vorname = ctx.userName.split(" ")[0] ?? ctx.userName;
  const partnerNamen = Array.from(new Set(ctx.auftraggeber.map((a) => a.backofficeName)));
  const partnerText = partnerNamen.length === 1 ? partnerNamen[0] : partnerNamen.join(", ");

  if (zeilen.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Übersicht" title={`Guten Tag, ${vorname}.`} subtitle={`Ihr Backoffice-Partner ${partnerText} bereitet Ihre Finanzierungsfälle auf.`} />
        <section className="flaeche-oben">
          <LeerZustand
            icon={FilePlus2}
            titel="Noch kein Auftrag"
            text="Legen Sie den ersten Auftrag an: Antragsteller, Auftragsart und Leistungsumfang genügen. Unterlagen laden Sie danach hoch oder lassen sie den Antragsteller über einen sicheren Link hochladen."
            aktion={{ href: "/portal/auftraege/neu", label: "Neuen Auftrag anlegen" }}
            nebenAktion={{ href: "/portal/kontingent", label: "Kontingent ansehen" }}
          />
        </section>
      </div>
    );
  }

  const aktiv = zeilen.filter((z) => istAktiv(z.status));
  // Mitwirkung ist gefragt, wenn das Backoffice ausdruecklich wartet oder eine
  // Rueckfrage offen ist - nicht bei jeder offenen Checklistenposition, die
  // das Backoffice gerade selbst bearbeitet.
  const mitwirkung = aktiv.filter((z) => wartetAufAuftraggeber(z.status) || z.offeneRueckfragen > 0);
  const neueRueckfragen = aktiv.reduce((acc, z) => acc + z.offeneRueckfragen, 0);
  const ergebnisse = zeilen.filter((z) => z.status === "uebergeben");
  const abgeschlossen = zeilen.filter((z) => z.status === "abgeschlossen");
  const zuletzt = [...zeilen].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 6);

  // Kontingent der aktuellen Periode je Auftraggeber-Datensatz
  const periode = periodeVon(jetzt);
  const ereignisse = await prisma.backofficeKontingentEreignis.findMany({
    where: { auftraggeberId: { in: ctx.auftraggeber.map((a) => a.id) }, periode: { in: [periode, vorperiode(periode)] } },
    select: { auftraggeberId: true, art: true, menge: true, periode: true },
  });
  const staende = ctx.auftraggeber.map((a) =>
    berechneKontingent({
      periode,
      modell: a.abrechnungsmodell as BackofficeAbrechnungsmodell,
      kontingentMonatlich: a.kontingentMonatlich,
      carryOverMax: a.carryOverMax,
      ereignisse: ereignisse.filter((e) => e.auftraggeberId === a.id) as KontingentEreignisRoh[],
    })
  );
  const frei = staende.reduce<number | null>((acc, s) => (s.frei == null ? acc : (acc ?? 0) + s.frei), null);

  const grund = (z: AuftragZeile) =>
    z.offeneRueckfragen > 0
      ? `${z.offeneRueckfragen} ${z.offeneRueckfragen === 1 ? "Rückfrage wartet" : "Rückfragen warten"} auf Ihre Antwort`
      : z.fehlendeUnterlagen > 0
        ? `Ihr Backoffice wartet auf Unterlagen – ${fehltText(z.fehlendeUnterlagen)}`
        : "Ihr Backoffice wartet auf Unterlagen";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Übersicht"
        title={`Guten Tag, ${vorname}.`}
        subtitle={`${partnerText} bearbeitet ${aktiv.length} ${aktiv.length === 1 ? "Auftrag" : "Aufträge"} für Sie.${mitwirkung.length > 0 ? ` Bei ${mitwirkung.length} ${mitwirkung.length === 1 ? "davon ist" : "davon ist"} Ihre Mitwirkung gefragt.` : " Derzeit ist nichts von Ihnen zu tun."}`}
        actions={
          <Button asChild size="sm">
            <Link href="/portal/auftraege/neu"><Plus aria-hidden />Neuen Auftrag anlegen</Link>
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <KpiGruppe titel="Ihre Mitwirkung" beschreibung="Hier wartet Ihr Backoffice auf Sie" ton={mitwirkung.length > 0 ? "warten" : "neutral"} className="[&>div:last-child]:sm:grid-cols-3 [&>div:last-child]:lg:grid-cols-3">
          <KpiKarte wert={mitwirkung.length} label="Aufträge mit Handlungsbedarf" ton="warnung" href="/portal/fehlende-unterlagen" />
          <KpiKarte wert={neueRueckfragen} label="Offene Rückfragen" ton="warnung" href="/portal/rueckfragen" />
          <KpiKarte wert={ergebnisse.length} label="Ergebnisse verfügbar" hinweis="zur Abnahme" ton="erfolg" href="/portal/ergebnisse" />
        </KpiGruppe>
        <KpiGruppe titel="Stand" className="[&>div:last-child]:sm:grid-cols-3 [&>div:last-child]:lg:grid-cols-3">
          <KpiKarte wert={aktiv.length} label="In Bearbeitung" href="/portal/auftraege?status=aktiv" klein />
          <KpiKarte wert={abgeschlossen.length} label="Abgeschlossen" href="/portal/auftraege?status=abgeschlossen" klein />
          <KpiKarte wert={frei == null ? "—" : frei} label="Fälle frei" hinweis={frei == null ? "Einzelabrechnung" : `Kontingent ${periode}`} href="/portal/kontingent" klein />
        </KpiGruppe>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={mitwirkung.length > 0 ? "border-l-[3px] border-l-warning" : undefined}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Jetzt gefragt</CardTitle>
            <CardDescription>Aufträge, bei denen Unterlagen oder eine Antwort von Ihnen fehlen.</CardDescription>
          </CardHeader>
          <CardContent>
            {mitwirkung.length === 0 ? (
              <LeerZustand kompakt icon={Inbox} titel="Nichts zu tun" text="Ihr Backoffice hat alles, was es braucht. Sie werden hier sehen, sobald etwas fehlt." />
            ) : (
              <ul className="divide-y">
                {mitwirkung.slice(0, 8).map((z) => (
                  <AuftragZeileKompakt key={z.id} z={z} grund={grund(z)} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Zuletzt aktualisiert</CardTitle>
            <CardDescription>Die jüngsten Bewegungen in Ihren Aufträgen.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {zuletzt.map((z) => (
                <AuftragZeileKompakt key={z.id} z={z} grund={`${datumZeitText(z.updatedAt)}${z.faelligAm ? ` · zugesagt bis ${datumText(z.faelligAm)}` : ""}`} />
              ))}
            </ul>
            <Link href="/portal/auftraege" className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
              Alle Aufträge <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
