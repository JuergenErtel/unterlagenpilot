"use client";

import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { reopenDocument } from "@/lib/actions/cases";
import { Button } from "@/components/ui/button";

/**
 * Holt ein freigegebenes (oder abgelehntes) Dokument zurueck ins Review-Center.
 *
 * Zweistufig: Ein Klick daneben duerfte keine Freigabe aufheben – die
 * Checkliste faerbt sich dadurch sichtbar zurueck, und bei mehreren Dutzend
 * Zeilen in der Fallakte liegen die Knoepfe eng beieinander.
 */
export function ReopenDocumentButton({
  documentId,
  label = "Freigabe zurücknehmen",
}: {
  documentId: string;
  label?: string;
}) {
  const [fragt, setFragt] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!fragt) {
    return (
      <button
        type="button"
        onClick={() => setFragt(true)}
        title={`${label} – das Dokument erscheint danach wieder im Review-Center`}
        className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        <Undo2 className="h-3 w-3" />
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span className="text-muted-foreground">Zurücknehmen?</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[11px]"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await reopenDocument(documentId);
            setFragt(false);
          })
        }
      >
        {pending ? "…" : "Ja"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[11px]"
        disabled={pending}
        onClick={() => setFragt(false)}
      >
        Nein
      </Button>
    </span>
  );
}
