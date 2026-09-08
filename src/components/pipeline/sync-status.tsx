"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCw, AlertTriangle, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gleicheLeadsAb, setzeLeadAbgleich } from "@/lib/actions/lead-sync";

/**
 * Zeigt, wann zuletzt abgeglichen wurde – und vor allem, wenn es scheiterte.
 * Ohne diese Zeile fällt ein kaputter Zugang erst auf, wenn tagelang nichts
 * mehr hereinkommt.
 *
 * Hier sitzt auch der Schalter für den automatischen Abgleich. Er gehört an
 * dieselbe Stelle wie die Statuszeile: Wer den Zufluss abstellen will, schaut
 * dorthin, wo er ihn zuletzt gesehen hat – nicht in eine Einstellungsseite.
 */
export function SyncStatus({
  zuletzt,
  angelegt,
  fehler,
  aktiv: aktivInitial,
}: {
  /** Fertig formatiert, z. B. "vor 4 Minuten" oder "noch nie". */
  zuletzt: string;
  angelegt: number;
  fehler: string | null;
  /** Läuft der automatische Abgleich (Cron alle 15 Minuten)? */
  aktiv: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [aktiv, setAktiv] = useState(aktivInitial);

  // Der Server bleibt die Wahrheit: Nach der Revalidierung (oder einem Wechsel
  // in einem anderen Tab) kommt der Wert neu herein und übersteuert den lokal
  // gehaltenen Zustand.
  useEffect(() => setAktiv(aktivInitial), [aktivInitial]);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <div
        className={
          fehler && aktiv
            ? "flex items-center gap-1.5 text-destructive"
            : "flex items-center gap-1.5 text-muted-foreground"
        }
      >
        {!aktiv ? (
          <>
            <PauseCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Automatischer Lead-Abgleich ist aus</span>
          </>
        ) : fehler ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Letzter Abgleich fehlgeschlagen: {fehler}</span>
          </>
        ) : (
          <span>
            {/* "Zuletzt abgeglichen noch nie" ist kein Satz. */}
            {zuletzt === "noch nie" ? "Noch nie abgeglichen" : `Zuletzt abgeglichen ${zuletzt}`}
            {angelegt > 0 && ` · ${angelegt} neue${angelegt === 1 ? "r Lead" : " Leads"}`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {meldung && <span className="text-muted-foreground">{meldung}</span>}
        {/* Utility-Aktion, keine Hauptaktion: Textknopf statt Rahmen, damit
            die Kopfzeile nicht fuenf gleichwertige Knoepfe traegt. */}
        {aktiv && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await gleicheLeadsAb();
                setMeldung(
                  r.status === "nicht_konfiguriert"
                    ? "FinLink ist nicht verbunden."
                    : r.status === "pausiert"
                      ? "Abgleich ist ausgeschaltet."
                      : r.status === "fehler"
                        ? `Fehlgeschlagen: ${r.fehler ?? "unbekannt"}`
                        : `${r.angelegt} neue Leads`
                );
              })
            }
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${pending ? "animate-spin" : ""}`} />
            Jetzt abgleichen
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
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
          {aktiv ? "Abgleich ausschalten" : "Abgleich einschalten"}
        </Button>
      </div>
    </div>
  );
}
