"use client";

import { useState, useTransition } from "react";
import { dokumentFreigebenUndNachfordern, nachforderungAufheben } from "@/lib/actions/cases";
import { Button } from "@/components/ui/button";

/**
 * "Freigeben und nachfordern": Die Unterlage bleibt in der Akte (und geht mit
 * zur Bank), aber die Position bleibt offen und traegt den Grund in jede
 * Nachforderung. Fall Schmidt, 06.09.2026: Wohnflaechenberechnung richtig
 * erkannt, aber nicht bankkonform.
 *
 * Client-Component mit direktem Server-Action-Aufruf, aus demselben Grund wie
 * der Ablehnen-Knopf: der Grund kommt aus einem Feld, das erst nach dem Klick
 * erscheint.
 */
export function NachfordernButton({
  documentId,
  vorlage,
  className = "",
}: {
  documentId: string;
  /** Vorbelegter Grund je Dokumenttyp - der Vermittler kann ihn aendern. */
  vorlage: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [grund, setGrund] = useState(vorlage);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" className={className} onClick={() => setOpen(true)}>
        Freigeben und nachfordern
      </Button>
    );
  }

  return (
    <div className="basis-full space-y-1.5">
      <label className="block text-xs text-muted-foreground" htmlFor={`nachforderung-${documentId}`}>
        Was soll der Kunde stattdessen liefern? (steht so in der Nachforderung)
      </label>
      <textarea
        id={`nachforderung-${documentId}`}
        value={grund}
        onChange={(e) => setGrund(e.target.value)}
        rows={3}
        maxLength={500}
        disabled={pending}
        className="w-full rounded-md border bg-background p-2 text-xs disabled:opacity-60"
      />
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Abbrechen
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending || grund.trim().length === 0}
          onClick={() =>
            startTransition(async () => {
              await dokumentFreigebenUndNachfordern(documentId, grund);
              setOpen(false);
            })
          }
        >
          {pending ? "…" : "Freigeben und nachfordern"}
        </Button>
      </div>
    </div>
  );
}

/** Hebt eine Nachforderung auf - die Bank akzeptiert die vorhandene Fassung doch. */
export function NachforderungAufhebenButton({ documentId, className = "" }: { documentId: string; className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={className}
      disabled={pending}
      onClick={() => startTransition(async () => nachforderungAufheben(documentId))}
    >
      {pending ? "…" : "Nachforderung aufheben"}
    </Button>
  );
}
