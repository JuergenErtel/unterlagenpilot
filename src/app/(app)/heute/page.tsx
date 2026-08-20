import Link from "next/link";
import { CheckCircle2, Undo2 } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { ladeHeute } from "@/lib/cases/heute-daten";
import { nachBaendern } from "@/lib/cases/heute";
import { aufgabeZuruecknehmen } from "@/lib/actions/heute";
import { AufgabenKarte } from "@/components/heute/aufgaben-karte";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { datumDe } from "@/lib/datum";

/**
 * Die Arbeitsliste des Tages.
 *
 * Ein Fall, eine Aufgabe, nach Dringlichkeit sortiert und ohne Deckel. Die
 * Berechnung steht in `heute.ts` (rein) und `heute-daten.ts` (Laden) – hier
 * wird nur angezeigt.
 */
export const dynamic = "force-dynamic";

export default async function HeutePage() {
  const ctx = await requireContext();
  const { aufgaben, erledigt, abgeschnitten } = await ladeHeute(ctx.organizationId);
  const baender = nachBaendern(aufgaben);

  return (
    <div className="space-y-6">
      {/* EIN Name für dieses Konzept, überall: "Tagesliste" – nicht mal
          "Heute", mal "To Dos", mal "Tagesliste" je nach Seite. */}
      <PageHeader
        eyebrow="Arbeit"
        title="Tagesliste"
        subtitle={
          aufgaben.length === 0
            ? "Nichts offen."
            : `${aufgaben.length} offene ${aufgaben.length === 1 ? "Aufgabe" : "Aufgaben"} – das Dringendste zuerst.`
        }
      />

      {aufgaben.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
            <p className="mt-3 text-sm font-medium">Alles abgearbeitet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Kein Fall wartet gerade auf dich. Neue Leads landen automatisch hier.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/dashboard">Zum Board</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {baender.map((band) => (
        <section key={band.dringlichkeit}>
          <h2 className="eyebrow mb-3">
            {band.label} <span className="text-muted-foreground">({band.aufgaben.length})</span>
          </h2>
          <div className="space-y-3">
            {band.aufgaben.map((a) => (
              <AufgabenKarte key={a.caseId} aufgabe={a} />
            ))}
          </div>
        </section>
      ))}

      {/*
        Der Deckel begrenzt die DATENBANKARBEIT, nicht die Anzeige – aber er
        darf nicht schweigen. Eine Liste, die 40 Fälle verschweigt und dabei
        aussieht wie „alles erfasst", ist schlimmer als eine, die zu lang ist.
      */}
      {abgeschnitten > 0 && (
        <p className="text-xs text-muted-foreground">
          {abgeschnitten} weitere aktive Fälle sind hier nicht berücksichtigt – die Liste rechnet
          die zuletzt bearbeiteten durch.{" "}
          <Link href="/cases" className="underline">
            Alle Fälle ansehen
          </Link>
        </p>
      )}

      {erledigt.length > 0 && (
        <details className="rounded-lg border bg-muted/30 p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Zuletzt abgehakt ({erledigt.length})
          </summary>
          <div className="mt-3 space-y-2">
            {erledigt.map((e) => (
              <div
                key={`${e.caseId}-${e.schritt}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium">{e.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{e.caseNumber}</span>
                  <div className="text-xs text-muted-foreground">
                    {e.titel} · {datumDe(e.erledigtAm)}
                  </div>
                </div>
                <form action={aufgabeZuruecknehmen.bind(null, e.caseId)}>
                  <input type="hidden" name="schritt" value={e.schritt} />
                  <Button type="submit" size="sm" variant="ghost">
                    <Undo2 className="h-4 w-4" /> Rückgängig
                  </Button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
