import Link from "next/link";
import { ArrowRight, Check, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";
import { datumDe } from "@/lib/datum";
import { aufgabeAbhaken, wiedervorlageErledigen } from "@/lib/actions/heute";
import type { HeuteAufgabe } from "@/lib/cases/heute";

/**
 * Eine Zeile der Tagesliste - und als `fokus` der eine Fall, der jetzt dran
 * ist.
 *
 * Server-Komponente ohne eigenes Buendel: Abhaken ist ein Formular mit einer
 * Server-Action, kein Klick-Handler. Die Liste ist die Seite, die morgens als
 * Erstes geladen wird, und sie funktioniert so auch, bevor JavaScript da ist.
 *
 * Genau EINE Hauptaktion je Karte: die konkrete Handlung in Tinte. "Fall
 * oeffnen" ist ein Textlink, "Erledigt" ein stiller Haken. Vorher standen
 * drei gleichwertige Knoepfe nebeneinander, und das Auge musste waehlen.
 */

/** Der Satz unter dem Titel, der den Termin einordnet. */
function terminSatz(a: HeuteAufgabe): string | null {
  if (a.terminGrund === "bank_nachforderung") return "Die Bank wartet auf eine Nachforderung.";
  if (!a.faelligAm) return null;
  const was = a.terminGrund === "frist" ? (a.fristTitel ?? "Frist") : "Wiedervorlage";
  if (a.tageUeberfaellig === 1) return `${was} seit gestern fällig.`;
  if (a.tageUeberfaellig > 1) return `${was} seit ${a.tageUeberfaellig} Tagen fällig.`;
  if (a.dringlichkeit === "heute") return `${was} heute fällig.`;
  return `${was} am ${datumDe(a.faelligAm)}.`;
}

function Abhaken({ aufgabe, gross }: { aufgabe: HeuteAufgabe; gross: boolean }) {
  if (aufgabe.abhaken === "wiedervorlage") {
    /*
      Fuer die Wiedervorlage ist "erledigt" nicht dasselbe wie "nie wieder":
      Der haeufige Ausgang eines solchen Anrufs ist "nochmal in drei Tagen".
    */
    return (
      <form action={wiedervorlageErledigen.bind(null, aufgabe.caseId)} className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground">
          <Check className="h-4 w-4" aria-hidden /> Erledigt
        </Button>
        <span className="flex items-center gap-1">
          <Input type="date" name="wiederAm" aria-label="Wieder vorlegen am" className={cn("h-8 w-36 text-xs", gross && "h-9")} />
          <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground">
            Wieder am
          </Button>
        </span>
      </form>
    );
  }
  return (
    <form action={aufgabeAbhaken.bind(null, aufgabe.caseId)}>
      <input type="hidden" name="schritt" value={aufgabe.schritt} />
      <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground">
        <Check className="h-4 w-4" aria-hidden /> Erledigt
      </Button>
    </form>
  );
}

export function AufgabenKarte({ aufgabe, fokus = false }: { aufgabe: HeuteAufgabe; fokus?: boolean }) {
  const satz = terminSatz(aufgabe);
  const ziel = aufgabe.cta?.href ?? `/cases/${aufgabe.caseId}`;
  const label = aufgabe.cta?.label ?? "Fall öffnen";
  const ueberfaellig = aufgabe.dringlichkeit === "ueberfaellig";

  return (
    <article
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-center",
        fokus ? "flaeche-oben p-5" : "flaeche-blatt p-4",
        !fokus && ueberfaellig && "border-l-[3px] border-l-destructive"
      )}
      aria-label={`${aufgabe.name}: ${aufgabe.titel}`}
    >
      <div className="min-w-0 flex-1">
        {fokus && <div className="eyebrow mb-2">Jetzt dran</div>}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Link href={`/cases/${aufgabe.caseId}`} className={cn("min-w-0 break-words font-medium text-foreground underline-offset-4 hover:underline", fokus && "t-abschnitt text-lg")}>
            {aufgabe.name}
          </Link>
          <span className="font-mono text-xs tabular text-muted-foreground">{aufgabe.caseNumber}</span>
          {ueberfaellig && (
            <span className="rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-destructive">
              {aufgabe.tageUeberfaellig > 0 ? `${aufgabe.tageUeberfaellig} Tage überfällig` : "überfällig"}
            </span>
          )}
        </div>
        <p className={cn("mt-1 font-medium text-foreground", fokus ? "text-[0.95rem]" : "text-sm")}>{aufgabe.titel}</p>
        <p className="t-hilfe mt-0.5">{satz ?? aufgabe.grund}</p>
        {aufgabe.schritt === "kontakt_aufnehmen" && aufgabe.telefon && (
          <span className="mt-2 inline-flex items-center gap-2 rounded-md border bg-card px-2.5 py-1 text-sm">
            <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="font-medium tabular-nums">{aufgabe.telefon}</span>
            <CopyButton value={aufgabe.telefon} label="Kopieren" />
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-end">
        <Button asChild size={fokus ? "default" : "sm"}>
          <Link href={ziel}>
            {label} <ArrowRight aria-hidden />
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-1">
          {aufgabe.cta && (
            <Link href={`/cases/${aufgabe.caseId}`} className="px-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Fall öffnen
            </Link>
          )}
          <Abhaken aufgabe={aufgabe} gross={fokus} />
        </div>
      </div>
    </article>
  );
}
