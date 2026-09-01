"use client";

import { useState, useTransition } from "react";
import { setDocumentReview } from "@/lib/actions/cases";
import { Button } from "@/components/ui/button";

/**
 * Lehnt ein Dokument ab und erfasst dabei optional einen Grund fuer den Kunden.
 *
 * Bewusst ein Client-Component mit direktem Server-Action-Aufruf (statt
 * `<form action={fn.bind(...)}>`): der freie Text kommt aus einem Eingabefeld,
 * das erst nach Klick erscheint – ein einfaches Formular liefert diesen Wert
 * nicht typsicher an eine Funktion mit festen, gebundenen Parametern.
 */
export function RejectDocumentButton({
  documentId,
  className = "w-full",
  label = "Ablehnen",
}: {
  documentId: string;
  /** Beschriftung des Knopfs - die Durchsicht sagt "Aussortieren", weil der Text daneben es so nennt. */
  label?: string;
  /** Voreinstellung volle Breite (Review-Center-Raster); im Arbeitsplatz steht er in einer Knopfreihe. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [grund, setGrund] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={className}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <div className="col-span-2 basis-full space-y-1.5">
      <label className="block text-xs text-muted-foreground" htmlFor={`grund-${documentId}`}>
        Grund für den Kunden (freiwillig)
      </label>
      <textarea
        id={`grund-${documentId}`}
        value={grund}
        onChange={(e) => setGrund(e.target.value)}
        placeholder="z. B. Seite 2 fehlt — bitte alle Seiten hochladen."
        rows={2}
        disabled={pending}
        className="w-full rounded-md border bg-background p-2 text-xs disabled:opacity-60"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setGrund("");
          }}
        >
          Abbrechen
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setDocumentReview(documentId, "abgelehnt", grund);
              setOpen(false);
              setGrund("");
            })
          }
        >
          {pending ? "…" : "Ablehnen"}
        </Button>
      </div>
    </div>
  );
}
