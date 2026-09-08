"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, PauseCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { setzeLeadAbgleich } from "@/lib/actions/lead-sync";

/**
 * An-/Aus-Schalter für den automatischen FinLink-Lead-Abgleich.
 *
 * Bewusst mit ausgeschriebener Folge statt eines nackten Kippschalters: Was
 * „aus" bedeutet, ist hier nicht selbsterklärend – der Einzelimport per
 * Vorgangsnummer läuft weiter, nur der Zufluss von selbst hört auf.
 */
export function FinlinkAbgleichSchalter({
  aktiv: aktivInitial,
  pausiertSeit,
}: {
  aktiv: boolean;
  /** Fertig formatiertes Datum oder null. */
  pausiertSeit: string | null;
}) {
  const [aktiv, setAktiv] = useState(aktivInitial);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setAktiv(aktivInitial), [aktivInitial]);

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Automatischer Lead-Abgleich
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <StatusDot tone={aktiv ? "ready" : "neutral"} />
          <span className="text-sm">
            {aktiv ? "Läuft alle 15 Minuten" : "Ausgeschaltet"}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const ziel = !aktiv;
              const r = await setzeLeadAbgleich(ziel);
              if (r.ok) setAktiv(ziel);
              setMeldung(r.meldung ?? null);
            })
          }
        >
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : aktiv ? (
            <PauseCircle className="mr-2 h-4 w-4" aria-hidden />
          ) : (
            <PlayCircle className="mr-2 h-4 w-4" aria-hidden />
          )}
          {aktiv ? "Import abstellen" : "Import einschalten"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {aktiv
          ? "Neue FinLink-Leads werden automatisch als Fälle angelegt. Abgestellt kommt nichts mehr von selbst herein – Vorgänge einzeln importieren kannst du weiterhin."
          : `Es kommen keine neuen Leads mehr von selbst herein${
              pausiertSeit ? ` (aus seit ${pausiertSeit})` : ""
            }. Einzelne Vorgänge kannst du weiterhin über „Vorgang aus FinLink importieren" holen. Beim Einschalten werden nur ab dann eingehende Leads übernommen.`}
      </p>
      {meldung && <p className="text-xs text-muted-foreground">{meldung}</p>}
    </div>
  );
}
