import Link from "next/link";
import { CheckCircle2, Undo2 } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { ladeHeute } from "@/lib/cases/heute-daten";
import { nachBaendern } from "@/lib/cases/heute";
import { aufgabeZuruecknehmen } from "@/lib/actions/heute";
import { AufgabenKarte } from "@/components/heute/aufgaben-karte";
import { PageHeader } from "@/components/ui/page-header";
import { LeerZustand } from "@/components/ui/flaechen";
import { Button } from "@/components/ui/button";
import { datumDe } from "@/lib/datum";
import { cn } from "@/lib/utils";

/**
 * Die Tagesliste - der Arbeitsplatz des Vertriebs.
 *
 * Ein Fall, eine Aufgabe, nach Dringlichkeit sortiert. Die Berechnung steht in
 * `heute.ts` (rein) und `heute-daten.ts` (Laden); hier wird nur angezeigt.
 * Ganz oben steht die eine Aufgabe, die jetzt dran ist (Arbeitsfokus, wie im
 * Backoffice); darunter die Baender nach Dringlichkeit als Flaechen mit
 * Gewicht - nicht nur als Ueberschriften.
 */
export const dynamic = "force-dynamic";

const BAND_FLAECHE: Record<string, string> = {
  ueberfaellig: "flaeche-blocker",
  heute: "flaeche-blatt",
};

export default async function HeutePage() {
  const ctx = await requireContext();
  const { aufgaben, erledigt, abgeschnitten } = await ladeHeute(ctx.organizationId);
  const [fokus, ...rest] = aufgaben;
  const baender = nachBaendern(rest);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mein Arbeitstag"
        title="Tagesliste"
        subtitle={
          aufgaben.length === 0
            ? "Nichts offen."
            : `${aufgaben.length} offene ${aufgaben.length === 1 ? "Aufgabe" : "Aufgaben"} – das Dringendste zuerst.`
        }
      />

      {!fokus && (
        <section className="flaeche-oben">
          <LeerZustand
            icon={CheckCircle2}
            titel="Alles abgearbeitet."
            text="Kein Fall wartet gerade auf dich. Neue Leads landen automatisch hier, sobald der Abgleich sie holt oder ein Formular eingeht."
            aktion={{ href: "/dashboard", label: "Zum Board" }}
            nebenAktion={{ href: "/cases/new", label: "Neuen Fall anlegen" }}
          />
        </section>
      )}

      {fokus && <AufgabenKarte aufgabe={fokus} fokus />}

      {baender.map((band) => (
        <section key={band.dringlichkeit} aria-label={band.label} className={cn(BAND_FLAECHE[band.dringlichkeit] ?? "flaeche-ablage", "overflow-hidden")}>
          <h2 className="flex items-baseline gap-2 border-b px-4 py-2.5">
            <span className="eyebrow">{band.label}</span>
            <span className="t-hilfe text-xs">{band.aufgaben.length} {band.aufgaben.length === 1 ? "Aufgabe" : "Aufgaben"}</span>
          </h2>
          <div className="space-y-3 p-3">
            {band.aufgaben.map((a) => (
              <AufgabenKarte key={a.caseId} aufgabe={a} />
            ))}
          </div>
        </section>
      ))}

      {abgeschnitten > 0 && (
        <p className="t-hilfe text-xs">
          {abgeschnitten} weitere aktive Fälle sind hier nicht berücksichtigt – die Liste rechnet die zuletzt bearbeiteten durch.{" "}
          <Link href="/cases" className="underline">Alle Fälle ansehen</Link>
        </p>
      )}

      {erledigt.length > 0 && (
        <details className="flaeche-ablage group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            Zuletzt abgehakt ({erledigt.length})
            <span className="t-hilfe text-xs group-open:hidden">anzeigen</span>
            <span className="t-hilfe hidden text-xs group-open:inline">ausblenden</span>
          </summary>
          <div className="space-y-2 border-t p-3">
            {erledigt.map((e) => (
              <div key={`${e.caseId}-${e.schritt}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{e.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{e.caseNumber}</span>
                  <div className="t-hilfe text-xs">{e.titel} · {datumDe(e.erledigtAm)}</div>
                </div>
                <form action={aufgabeZuruecknehmen.bind(null, e.caseId)}>
                  <input type="hidden" name="schritt" value={e.schritt} />
                  <Button type="submit" size="sm" variant="ghost">
                    <Undo2 className="h-4 w-4" aria-hidden /> Rückgängig
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
