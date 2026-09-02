import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { KpiGruppe, KpiKarte } from "@/components/ui/flaechen";
import { ListenKarte } from "@/components/backoffice/auftrags-liste";
import { Arbeitsfokus } from "@/components/backoffice/arbeitsfokus";
import { BackofficeOnboarding } from "@/components/backoffice/onboarding";
import { StatusMarke } from "@/components/backoffice/status-anzeigen";
import { auftraegeFilterFuer, requireBackoffice } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen } from "@/lib/backoffice/auftraege";
import { baueDashboardListen, berechneKennzahlen } from "@/lib/backoffice/kennzahlen";
import { fokusAuftrag } from "@/lib/backoffice/fokus";

export const dynamic = "force-dynamic";

/**
 * Das Auftragsdashboard - drei Fragen in Sekunden: Was ist jetzt dran
 * (Arbeitsfokus), wo brennt es (Jetzt handeln), worauf warten wir (Mitwirkung),
 * wie viel liegt an (Arbeitsvolumen). Ohne Auftraege: der gefuehrte Einstieg.
 */
export default async function BackofficeDashboardPage() {
  const ctx = await requireBackoffice();
  const jetzt = new Date();
  const zeilen = await ladeAuftragZeilen(auftraegeFilterFuer(ctx));
  const manager = ctx.backofficeRolle === "manager";

  if (zeilen.length === 0) {
    const hatAuftraggeber =
      (await prisma.backofficeAuftraggeber.count({ where: { backofficeOrganizationId: ctx.organizationId, aktiv: true, abrechnungsmodell: { not: "intern" } } })) > 0;
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Übersicht" title="Dashboard" subtitle="Noch kein Auftrag – so geht es los." />
        <BackofficeOnboarding manager={manager} hatAuftraggeber={hatAuftraggeber} />
      </div>
    );
  }

  const kennzahlen = berechneKennzahlen(zeilen, jetzt);
  const listen = baueDashboardListen(zeilen, jetzt);
  const fokus = fokusAuftrag(zeilen, jetzt);
  const offeneRueckfragen = zeilen.reduce((acc, z) => acc + z.offeneRueckfragen, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Übersicht"
        title="Dashboard"
        subtitle={
          ctx.backofficeRolle === "bearbeiter"
            ? "Ihre Aufträge und die noch nicht zugewiesenen."
            : `${kennzahlen.aktiveGesamt} aktive ${kennzahlen.aktiveGesamt === 1 ? "Auftrag" : "Aufträge"} · Stand ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(jetzt)} Uhr`
        }
        actions={
          manager ? (
            <Button asChild size="sm">
              <Link href="/backoffice/auftraege/neu"><Plus aria-hidden />Neuer Auftrag</Link>
            </Button>
          ) : undefined
        }
      />

      {fokus ? (
        <Arbeitsfokus auftrag={fokus} jetzt={jetzt} weitere={Math.max(0, listen.jetztBearbeiten.length - 1)} />
      ) : (
        <section className="flaeche-oben px-5 py-4">
          <div className="eyebrow">Jetzt dran</div>
          <p className="mt-1 text-sm">Nichts wartet auf das Backoffice. Alle aktiven Aufträge liegen beim Auftraggeber oder sind übergeben.</p>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <KpiGruppe titel="Jetzt handeln" beschreibung="Fristen und Entscheidungen des Backoffice" ton="handeln">
          <KpiKarte wert={kennzahlen.slaUeberschritten} label="Frist überschritten" ton="kritisch" href="/backoffice/queue?sla=ueberschritten" />
          <KpiKarte wert={kennzahlen.heuteFaellig} label="Heute fällig" ton="warnung" href="/backoffice/queue?sla=heute" />
          <KpiKarte wert={kennzahlen.slaGefaehrdet} label="Frist gefährdet" hinweis="morgen fällig" ton="warnung" href="/backoffice/queue?sla=gefaehrdet" />
          <KpiKarte wert={kennzahlen.qualitaetskontrollenOffen} label="Qualitätskontrolle offen" ton="info" href="/backoffice/qualitaetskontrolle" />
        </KpiGruppe>
        <KpiGruppe titel="Wartet auf Mitwirkung" beschreibung="Der Ball liegt beim Auftraggeber" ton="warten" className="[&>div:last-child]:sm:grid-cols-3 [&>div:last-child]:lg:grid-cols-3">
          <KpiKarte wert={kennzahlen.wartetAufUnterlagen} label="Wartet auf Unterlagen" href="/backoffice/fehlende-unterlagen" />
          <KpiKarte wert={kennzahlen.wartetAufAuftraggeber} label="Wartet auf Auftraggeber" hinweis="Unterlagen oder Rückfrage" href="/backoffice/rueckfragen" />
          <KpiKarte wert={offeneRueckfragen} label="Rückfragen offen" href="/backoffice/rueckfragen" />
        </KpiGruppe>
      </div>

      <KpiGruppe titel="Arbeitsvolumen" beschreibung="Mengen, keine Alarme" className="[&>div:last-child]:lg:grid-cols-5">
        <KpiKarte wert={kennzahlen.neuEingegangen} label="Neu eingegangen" href="/backoffice/queue?status=neu_eingegangen" klein />
        <KpiKarte wert={kennzahlen.dokumenteZuPruefen} label="Dokumente zu prüfen" href="/backoffice/dokumentenpruefung" klein />
        <KpiKarte wert={kennzahlen.aktiveGesamt} label="Aktive Aufträge" href="/backoffice/queue" klein />
        <KpiKarte wert={kennzahlen.heuteFertiggestellt} label="Heute fertiggestellt" hinweis="übergeben" ton="erfolg" klein />
        <KpiKarte
          wert={kennzahlen.durchschnittBearbeitungstage == null ? "—" : kennzahlen.durchschnittBearbeitungstage.toLocaleString("de-DE")}
          label="Ø Bearbeitungstage"
          hinweis="Eingang bis Übergabe, 30 Tage"
          klein
        />
      </KpiGruppe>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListenKarte titel="Frist läuft heute ab" beschreibung="Heute fällig oder bereits überfällig." zeilen={listen.fristHeute} jetzt={jetzt} leerText="Heute läuft keine Frist ab." mehrHref="/backoffice/queue?sla=heute" />
        <ListenKarte titel="Rückmeldung eingegangen" beschreibung="Der Auftraggeber hat eine Rückfrage beantwortet." zeilen={listen.rueckmeldungEingegangen} jetzt={jetzt} leerText="Keine neue Rückmeldung." mehrHref="/backoffice/rueckfragen" />
        <ListenKarte titel="Qualitätskontrolle erforderlich" beschreibung="Bereit für das zweite Augenpaar." zeilen={listen.qualitaetskontrolle} jetzt={jetzt} leerText="Nichts wartet auf die Qualitätskontrolle." mehrHref="/backoffice/qualitaetskontrolle" />
        <ListenKarte titel="Übergabebereit" beschreibung="Freigegeben – jetzt an den Auftraggeber übergeben." zeilen={listen.uebergabebereit} jetzt={jetzt} leerText="Kein Auftrag ist übergabebereit." mehrHref="/backoffice/uebergabe" />
      </div>

      <details className="flaeche-ablage group">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          Verteilung nach Status und Bearbeiter
          <span className="t-hilfe text-xs group-open:hidden">anzeigen</span>
          <span className="t-hilfe hidden text-xs group-open:inline">ausblenden</span>
        </summary>
        <div className="grid gap-6 border-t px-4 py-4 md:grid-cols-2">
          <div>
            <div className="eyebrow mb-2">Aufträge je Status</div>
            <ul className="divide-y">
              {kennzahlen.jeStatus.map((s) => (
                <li key={s.status} className="flex items-center justify-between gap-3 py-1.5">
                  <Link href={`/backoffice/auftraege?status=${s.status}`} className="hover:underline"><StatusMarke status={s.status} /></Link>
                  <span className="text-sm tabular">{s.anzahl}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="eyebrow mb-2">Aktive Aufträge je Bearbeiter</div>
            <ul className="divide-y">
              {kennzahlen.jeBearbeiter.map((b) => (
                <li key={b.bearbeiterId ?? "keiner"} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <Link href={`/backoffice/queue?bearbeiter=${b.bearbeiterId ?? "keiner"}`} className={b.bearbeiterId ? "hover:underline" : "text-muted-foreground hover:underline"}>{b.name}</Link>
                  <span className="tabular">{b.anzahl}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListenKarte titel="Zuletzt bearbeitet" zeilen={listen.zuletztBearbeitet} jetzt={jetzt} leerText="Noch keine Aktivität." mehrHref="/backoffice/auftraege" />
      </div>
    </div>
  );
}
