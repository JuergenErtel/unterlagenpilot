"use client";

import { useState, useTransition } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gleicheLeadsAb } from "@/lib/actions/lead-sync";

/**
 * Zeigt, wann zuletzt abgeglichen wurde – und vor allem, wenn es scheiterte.
 * Ohne diese Zeile fällt ein kaputter Zugang erst auf, wenn tagelang nichts
 * mehr hereinkommt.
 */
export function SyncStatus({
  zuletzt,
  angelegt,
  fehler,
}: {
  /** Fertig formatiert, z. B. "vor 4 Minuten" oder "noch nie". */
  zuletzt: string;
  angelegt: number;
  fehler: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
      <div
        className={
          fehler ? "flex items-center gap-1.5 text-destructive" : "text-muted-foreground"
        }
      >
        {fehler ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Letzter Abgleich fehlgeschlagen: {fehler}</span>
          </>
        ) : (
          <span>
            Zuletzt abgeglichen {zuletzt}
            {angelegt > 0 && ` · ${angelegt} neue${angelegt === 1 ? "r Lead" : " Leads"}`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {meldung && <span className="text-muted-foreground">{meldung}</span>}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await gleicheLeadsAb();
              setMeldung(
                r.status === "nicht_konfiguriert"
                  ? "FinLink ist nicht verbunden."
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
      </div>
    </div>
  );
}
