"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LEAD_PHASES, LEAD_PHASE_LABELS, type LeadPhase } from "@/lib/domain/enums";
import { setzePhase, hebeVerlustAuf } from "@/lib/actions/lead-phase";
import { KreditpruefungFormular } from "@/components/case/kreditpruefung-formular";

/**
 * Vertriebsphase im Fallkopf – neben dem Bearbeitungsstatus, nicht statt seiner.
 * Der Vorschlag steht als Chip daneben und wird mit einem Klick bestätigt.
 */
export function LeadPhaseSelect({
  caseId,
  phase,
  vorschlag,
  verlorenGrund,
}: {
  caseId: string;
  phase: string;
  vorschlag: string | null;
  /** Gesetzt heißt: Der Fall ist verloren. */
  verlorenGrund: string | null;
}) {
  const [pending, startTransition] = useTransition();
  // Beim Sprung in die Einreichungsphase gleich fragen, WOHIN und zu welchen
  // Konditionen – sonst steht die Karte im Kanban und niemand weiss es mehr.
  const [erfassen, setErfassen] = useState(false);

  const wechsle = (ziel: string) =>
    startTransition(async () => {
      await setzePhase(caseId, ziel);
      if (ziel === "kreditpruefung_eingereicht") setErfassen(true);
    });

  if (verlorenGrund !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">Verloren · {verlorenGrund}</Badge>
        <button
          className="text-xs text-muted-foreground hover:underline disabled:opacity-60"
          disabled={pending}
          onClick={() => {
            if (!confirm("Verlust aufheben? Grund und Datum gehen dabei verloren.")) return;
            startTransition(() => void hebeVerlustAuf(caseId));
          }}
        >
          Verlust aufheben
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Vertriebsphase"
        value={phase}
        disabled={pending}
        onChange={(e) => wechsle(e.target.value)}
        className="h-8 rounded-md border bg-background px-2 text-sm disabled:opacity-60"
      >
        {LEAD_PHASES.map((p: LeadPhase) => (
          <option key={p} value={p}>
            {LEAD_PHASE_LABELS[p]}
          </option>
        ))}
      </select>
      {vorschlag && (
        <button
          disabled={pending}
          onClick={() => wechsle(vorschlag)}
          className="inline-flex items-center gap-1 rounded border border-dashed px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
        >
          → {LEAD_PHASE_LABELS[vorschlag as LeadPhase]}? <Check className="h-3 w-3" />
        </button>
      )}
      {phase === "kreditpruefung_eingereicht" && !erfassen && (
        <button
          onClick={() => setErfassen(true)}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Einreichungsdaten
        </button>
      )}
      <KreditpruefungFormular caseId={caseId} offen={erfassen} onClose={() => setErfassen(false)} />
    </div>
  );
}
