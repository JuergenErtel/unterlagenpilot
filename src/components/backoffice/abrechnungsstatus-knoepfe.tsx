"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { abrechnungsstatusAction } from "@/lib/actions/backoffice";
import {
  BACKOFFICE_ABRECHNUNGSSTATUS,
  BACKOFFICE_ABRECHNUNGSSTATUS_LABELS,
  type BackofficeAbrechnungsstatus,
} from "@/lib/domain/enums";

/** Drei Knoepfe, der aktuelle Status ist gefuellt. Nur fuer Manager rendern. */
export function AbrechnungsstatusKnoepfe({
  auftragId,
  aktuell,
  className,
}: {
  auftragId: string;
  aktuell: BackofficeAbrechnungsstatus;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {BACKOFFICE_ABRECHNUNGSSTATUS.map((s) => (
        <Button
          key={s}
          type="button"
          size="sm"
          variant={s === aktuell ? "default" : "outline"}
          disabled={pending || s === aktuell}
          aria-pressed={s === aktuell}
          onClick={() =>
            start(async () => {
              const r = await abrechnungsstatusAction(auftragId, s);
              setFehler(r.error ?? null);
            })
          }
        >
          {BACKOFFICE_ABRECHNUNGSSTATUS_LABELS[s]}
        </Button>
      ))}
      {fehler && (
        <span className="text-xs text-destructive" role="alert">
          {fehler}
        </span>
      )}
    </div>
  );
}
