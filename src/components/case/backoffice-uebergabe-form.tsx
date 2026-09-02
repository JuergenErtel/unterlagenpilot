"use client";

import { useActionState, useState } from "react";
import { anBackofficeUebergebenAction } from "@/lib/actions/backoffice-vertrieb";
import type { AktionsErgebnis } from "@/lib/actions/backoffice";
import { AUFTRAGSARTEN, LEISTUNGSBAUSTEINE } from "@/lib/backoffice/leistungen";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

/**
 * "An Backoffice uebergeben" aus der Fallverwaltung. Die Auftragsart belegt
 * die Leistungsbausteine vor; der Vermittler kann sie danach noch anpassen.
 * Bei Erfolg leitet die Action zurueck in die Fallakte - dort steht dann
 * die Statuskarte.
 */
export function BackofficeUebergabeForm({ caseId }: { caseId: string }) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(anBackofficeUebergebenAction, {});
  const erste = AUFTRAGSARTEN[0];
  const [auftragsart, setAuftragsart] = useState<string>(erste?.key ?? "");
  const [leistungen, setLeistungen] = useState<ReadonlySet<string>>(new Set(erste?.leistungen ?? []));

  function waehleArt(key: string) {
    setAuftragsart(key);
    const art = AUFTRAGSARTEN.find((a) => a.key === key);
    setLeistungen(new Set(art?.leistungen ?? []));
  }

  function schalteLeistung(key: string, an: boolean) {
    setLeistungen((alt) => {
      const neu = new Set(alt);
      if (an) neu.add(key);
      else neu.delete(key);
      return neu;
    });
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="caseId" value={caseId} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Auftragsart</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {AUFTRAGSARTEN.map((a) => {
            const gewaehlt = a.key === auftragsart;
            return (
              <label
                key={a.key}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-sm transition-colors",
                  gewaehlt ? "border-primary bg-primary/5" : "hover:border-foreground/25"
                )}
              >
                <input
                  type="radio"
                  name="auftragsart"
                  value={a.key}
                  checked={gewaehlt}
                  onChange={() => waehleArt(a.key)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{a.label}</span>
                  <span className="block text-xs text-muted-foreground">{a.beschreibung}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Leistungsbausteine</legend>
        <p className="text-xs text-muted-foreground">
          Durch die Auftragsart vorbelegt – bei Bedarf ergänzen oder abwählen.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {LEISTUNGSBAUSTEINE.map((l) => (
            <label key={l.key} className="flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm">
              <input
                type="checkbox"
                name="leistungen"
                value={l.key}
                checked={leistungen.has(l.key)}
                onChange={(e) => schalteLeistung(l.key, e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="min-w-0">
                <span className="block font-medium">{l.label}</span>
                <span className="block text-xs text-muted-foreground">{l.beschreibung}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="bo-hinweise">Hinweise für das Backoffice</Label>
        <Textarea
          id="bo-hinweise"
          name="hinweise"
          rows={3}
          placeholder="Besonderheiten des Falls, Zielbank, Eile, Ansprechpartner …"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Der Fall bleibt in Ihrer Pipeline. Seine Vertriebsphase und sein Status ändern sich durch
        das Backoffice nicht. Das Backoffice arbeitet an derselben Akte.
      </p>

      {state.error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton pendingLabel="Wird übergeben …">An Backoffice übergeben</SubmitButton>
    </form>
  );
}
