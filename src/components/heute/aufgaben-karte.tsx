import Link from "next/link";
import { Check, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { datumDe } from "@/lib/datum";
import { aufgabeAbhaken, wiedervorlageErledigen } from "@/lib/actions/heute";
import type { HeuteAufgabe } from "@/lib/cases/heute";

/**
 * Eine Zeile der Heute-Liste.
 *
 * Server-Komponente ohne eigenes Bündel: Abhaken ist ein Formular mit einer
 * Server-Action, kein Klick-Handler. Das ist hier nicht nur billiger, sondern
 * auch robuster – die Liste ist die Seite, die morgens als Erstes geladen
 * wird, und sie funktioniert so auch, bevor JavaScript da ist.
 */

/** Der Satz unter dem Titel, der den Termin einordnet. */
function terminSatz(a: HeuteAufgabe): string | null {
  if (a.terminGrund === "bank_nachforderung") return "Die Bank wartet auf eine Nachforderung.";
  if (!a.faelligAm) return null;
  const was =
    a.terminGrund === "frist" ? (a.fristTitel ?? "Frist") : "Wiedervorlage";
  if (a.tageUeberfaellig === 1) return `${was} seit gestern fällig.`;
  if (a.tageUeberfaellig > 1) return `${was} seit ${a.tageUeberfaellig} Tagen fällig.`;
  if (a.dringlichkeit === "heute") return `${was} heute fällig.`;
  return `${was} am ${datumDe(a.faelligAm)}.`;
}

export function AufgabenKarte({ aufgabe }: { aufgabe: HeuteAufgabe }) {
  const satz = terminSatz(aufgabe);

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 card-elevated sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium">{aufgabe.name}</span>
          <Link
            href={`/cases/${aufgabe.caseId}`}
            className="font-mono text-xs text-muted-foreground hover:underline"
          >
            {aufgabe.caseNumber}
          </Link>
          {aufgabe.dringlichkeit === "ueberfaellig" && (
            <Badge variant="warning">
              {aufgabe.tageUeberfaellig > 0 ? `${aufgabe.tageUeberfaellig} Tage überfällig` : "überfällig"}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm">{aufgabe.titel}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{satz ?? aufgabe.grund}</p>
        {/*
          Die Nummer steht lesbar da statt nur als Wähl-Link: Am Mac reicht
          `tel:` die Nummer an FaceTime weiter, und wer das nicht eingerichtet
          hat, klickt auf einen Knopf, der nichts tut. Dieselbe Entscheidung
          wie in der Fallakte (Jürgen, 15.08.2026).
        */}
        {aufgabe.schritt === "kontakt_aufnehmen" && aufgabe.telefon && (
          <span className="mt-2 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm">
            <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="font-medium tabular-nums">{aufgabe.telefon}</span>
            <CopyButton value={aufgabe.telefon} label="Kopieren" />
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {aufgabe.cta ? (
          <Button asChild variant="outline" size="sm">
            <Link href={aufgabe.cta.href}>{aufgabe.cta.label}</Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${aufgabe.caseId}`}>Fall öffnen</Link>
          </Button>
        )}

        {aufgabe.abhaken === "wiedervorlage" ? (
          /*
            Für die Wiedervorlage ist „erledigt" nicht dasselbe wie „nie
            wieder": Der häufige Ausgang eines solchen Anrufs ist „nochmal in
            drei Tagen". Ein reiner Haken würde genau das wegwerfen und den
            Fall stillschweigend von der Liste nehmen.
          */
          <form action={wiedervorlageErledigen.bind(null, aufgabe.caseId)} className="flex items-end gap-2">
            <Button type="submit" size="sm" variant="secondary">
              <Check className="h-4 w-4" /> Erledigt
            </Button>
            <div className="flex items-end gap-1">
              <Input
                type="date"
                name="wiederAm"
                aria-label="Wieder vorlegen am"
                className="h-9 w-36"
              />
              <Button type="submit" size="sm" variant="ghost">
                Wieder am
              </Button>
            </div>
          </form>
        ) : (
          <form action={aufgabeAbhaken.bind(null, aufgabe.caseId)}>
            <input type="hidden" name="schritt" value={aufgabe.schritt} />
            <Button type="submit" size="sm" variant="secondary">
              <Check className="h-4 w-4" /> Erledigt
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
