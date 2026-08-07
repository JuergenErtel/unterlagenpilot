"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOSS_REASONS, LOSS_REASON_LABELS, type LossReason } from "@/lib/domain/enums";

/**
 * Fragt beim Verlust nach dem Grund. Feste Liste, weil sich Freitext nicht
 * auswerten lässt – Freitextfeld daneben, weil keine Liste vollständig ist.
 */
export function LossDialog({
  offen,
  onAbbrechen,
  onBestaetigen,
}: {
  offen: boolean;
  onAbbrechen: () => void;
  onBestaetigen: (grund: LossReason, notiz: string) => void;
}) {
  const [grund, setGrund] = useState<LossReason>("kondition");
  const [notiz, setNotiz] = useState("");
  if (!offen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-background p-5 shadow-lg">
        <h2 className="text-base font-semibold">Fall als verloren markieren</h2>
        <p className="text-xs text-muted-foreground">
          Die Phase bleibt erhalten – so bleibt nachvollziehbar, an welcher Stelle der Fall
          verloren ging.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="grund">Grund</Label>
          <select
            id="grund"
            value={grund}
            onChange={(e) => setGrund(e.target.value as LossReason)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {LOSS_REASONS.map((r) => (
              <option key={r} value={r}>
                {LOSS_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notiz">Anmerkung (optional)</Label>
          <Input id="notiz" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onAbbrechen}>
            Abbrechen
          </Button>
          <Button onClick={() => onBestaetigen(grund, notiz)}>Als verloren markieren</Button>
        </div>
      </div>
    </div>
  );
}
