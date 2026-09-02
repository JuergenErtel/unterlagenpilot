import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kennzahl, ListenKarte } from "@/components/backoffice/auftrags-liste";
import { StatusMarke } from "@/components/backoffice/status-anzeigen";
import { auftraegeFilterFuer, requireBackoffice } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen } from "@/lib/backoffice/auftraege";
import { baueDashboardListen, berechneKennzahlen } from "@/lib/backoffice/kennzahlen";

export const dynamic = "force-dynamic";

/**
 * Das Auftragsdashboard: was heute Aufmerksamkeit braucht. Kennzahlen oben,
 * darunter die Listen - jede fuehrt zum Auftrag oder zur Themenliste.
 */
export default async function BackofficeDashboardPage() {
  const ctx = await requireBackoffice();
  const jetzt = new Date();
  const zeilen = await ladeAuftragZeilen(auftraegeFilterFuer(ctx));
  const kennzahlen = berechneKennzahlen(zeilen, jetzt);
  const listen = baueDashboardListen(zeilen, jetzt);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="BaufiDesk Backoffice"
        title="Auftragsdashboard"
        subtitle={
          ctx.backofficeRolle === "bearbeiter"
            ? "Ihre Aufträge und die noch nicht zugewiesenen - sortiert nach dem, was zuerst dran ist."
            : "Alle Aufträge der Organisation - sortiert nach dem, was zuerst dran ist."
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/backoffice/queue">Bearbeitungsqueue</Link>
            </Button>
            {ctx.backofficeRolle === "manager" && (
              <Button asChild size="sm">
                <Link href="/backoffice/auftraege/neu">
                  <Plus />
                  Neuer Auftrag
                </Link>
              </Button>
            )}
          </>
        }
      />

      <section aria-label="Kennzahlen" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <Kennzahl wert={kennzahlen.neuEingegangen} label="Neu eingegangen" href="/backoffice/queue?status=neu_eingegangen" />
        <Kennzahl wert={kennzahlen.heuteFaellig} label="Heute fällig" href="/backoffice/queue?sla=heute" tone={kennzahlen.heuteFaellig > 0 ? "warnung" : "neutral"} />
        <Kennzahl wert={kennzahlen.slaGefaehrdet} label="Frist gefährdet" hinweis="morgen fällig" href="/backoffice/queue?sla=gefaehrdet" tone={kennzahlen.slaGefaehrdet > 0 ? "warnung" : "neutral"} />
        <Kennzahl wert={kennzahlen.slaUeberschritten} label="Frist überschritten" href="/backoffice/queue?sla=ueberschritten" tone={kennzahlen.slaUeberschritten > 0 ? "blocker" : "neutral"} />
        <Kennzahl wert={kennzahlen.wartetAufUnterlagen} label="Wartet auf Unterlagen" href="/backoffice/fehlende-unterlagen" />
        <Kennzahl wert={kennzahlen.wartetAufAuftraggeber} label="Wartet auf Auftraggeber" hinweis="Unterlagen oder Rückfrage" href="/backoffice/rueckfragen" />
        <Kennzahl wert={kennzahlen.dokumenteZuPruefen} label="Dokumente zu prüfen" href="/backoffice/dokumentenpruefung" />
        <Kennzahl wert={kennzahlen.qualitaetskontrollenOffen} label="Qualitätskontrolle offen" href="/backoffice/qualitaetskontrolle" />
        <Kennzahl wert={kennzahlen.heuteFertiggestellt} label="Heute fertiggestellt" hinweis="übergeben" tone={kennzahlen.heuteFertiggestellt > 0 ? "ok" : "neutral"} />
        <Kennzahl
          wert={kennzahlen.durchschnittBearbeitungstage == null ? "—" : kennzahlen.durchschnittBearbeitungstage.toLocaleString("de-DE")}
          label="Ø Bearbeitungstage"
          hinweis="Eingang bis Übergabe, 30 Tage"
        />
        <Kennzahl wert={kennzahlen.aktiveGesamt} label="Aktive Aufträge" href="/backoffice/queue" />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Aufträge je Status</CardTitle>
            <CardDescription>Alle sichtbaren Aufträge, auch abgeschlossene.</CardDescription>
          </CardHeader>
          <CardContent>
            {kennzahlen.jeStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Aufträge.</p>
            ) : (
              <ul className="divide-y">
                {kennzahlen.jeStatus.map((s) => (
                  <li key={s.status} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <Link href={`/backoffice/queue?status=${s.status}`} className="hover:underline">
                      <StatusMarke status={s.status} />
                    </Link>
                    <span className="text-sm tabular text-foreground">{s.anzahl}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Aufträge je Bearbeiter</CardTitle>
            <CardDescription>Nur aktive Aufträge.</CardDescription>
          </CardHeader>
          <CardContent>
            {kennzahlen.jeBearbeiter.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine aktiven Aufträge.</p>
            ) : (
              <ul className="divide-y">
                {kennzahlen.jeBearbeiter.map((b) => (
                  <li key={b.bearbeiterId ?? "keiner"} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <Link
                      href={`/backoffice/queue?bearbeiter=${b.bearbeiterId ?? "keiner"}`}
                      className={b.bearbeiterId ? "text-sm text-foreground hover:underline" : "text-sm text-muted-foreground hover:underline"}
                    >
                      {b.name}
                    </Link>
                    <span className="text-sm tabular text-foreground">{b.anzahl}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListenKarte
          titel="Jetzt bearbeiten"
          beschreibung="Aktive Aufträge, an denen das Backoffice arbeiten kann - nach Priorität und Frist."
          zeilen={listen.jetztBearbeiten}
          jetzt={jetzt}
          leerText="Nichts wartet auf Bearbeitung."
          mehrHref="/backoffice/queue"
        />
        <ListenKarte
          titel="Frist läuft heute ab"
          beschreibung="Heute fällig oder bereits überfällig."
          zeilen={listen.fristHeute}
          jetzt={jetzt}
          leerText="Heute läuft keine Frist ab."
          mehrHref="/backoffice/queue?sla=heute"
        />
        <ListenKarte
          titel="Rückmeldung eingegangen"
          beschreibung="Der Auftraggeber hat eine Rückfrage beantwortet."
          zeilen={listen.rueckmeldungEingegangen}
          jetzt={jetzt}
          leerText="Keine neuen Rückmeldungen."
          mehrHref="/backoffice/rueckfragen"
        />
        <ListenKarte
          titel="Qualitätskontrolle erforderlich"
          beschreibung="Fertig aufbereitet, wartet auf die Freigabe."
          zeilen={listen.qualitaetskontrolle}
          jetzt={jetzt}
          leerText="Keine Aufträge in der Qualitätskontrolle."
          mehrHref="/backoffice/qualitaetskontrolle"
        />
        <ListenKarte
          titel="Übergabebereit"
          beschreibung="Freigegeben - kann an den Auftraggeber übergeben werden."
          zeilen={listen.uebergabebereit}
          jetzt={jetzt}
          leerText="Nichts ist übergabebereit."
          mehrHref="/backoffice/uebergabe"
        />
        <ListenKarte
          titel="Zuletzt bearbeitet"
          beschreibung="Die jüngsten Änderungen."
          zeilen={listen.zuletztBearbeitet}
          jetzt={jetzt}
          leerText="Noch keine Aktivität."
          mehrHref="/backoffice/auftraege"
        />
      </div>
    </div>
  );
}
