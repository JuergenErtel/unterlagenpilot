"use client";

import { useActionState } from "react";
import { Undo2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  buendelRueckgaengigAction,
  type BuendelRueckgaengigState,
} from "@/lib/actions/buendelung";

/**
 * Nimmt eine Buendelung zurueck - dort, wo das Dokument liegt.
 *
 * Das Sicherheitsnetz zur schlanken Vorschlagsliste: ohne diesen Knopf waere
 * eine falsche Gruppierung eine Sackgasse. Erscheint nur, solange das
 * Dokument nicht freigegeben ist - danach hat der Vermittler entschieden,
 * und der Weg zurueck fuehrt ueber "Freigabe zuruecknehmen".
 *
 * Eigener `useActionState` statt eines nackten `<form action>`, wie schon bei
 * `buendelZusammenfuegenAction`/`seitenZusammenfuegenAction`: Ein
 * fehlgeschlagenes Rueckgaengigmachen (Dokument inzwischen andernorts
 * freigegeben oder entfernt) darf nicht stillschweigend im Leeren verpuffen.
 * Anders als bei der Handauswahl in seiten-auswahl.tsx braucht es hier keine
 * "gilt noch fuer diese Auswahl"-Pruefung: Diese Zeile zeigt genau EIN
 * Dokument, und sobald sich sein Zustand aendert (erledigt oder anderswo
 * freigegeben), rendert die Fallseite die Zeile neu und dieser Knopf
 * verschwindet mit ihr - ein stehen gebliebener Grund kann es also gar nicht
 * geben.
 */
export function BuendelRueckgaengig({
  caseId,
  documentId,
  seiten,
}: {
  caseId: string;
  documentId: string;
  seiten: number;
}) {
  const [state, rueckgaengig] = useActionState<BuendelRueckgaengigState, FormData>(
    buendelRueckgaengigAction,
    {}
  );

  return (
    <form action={rueckgaengig} className="min-w-0">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="documentId" value={documentId} />
      {/* Textlink statt gerahmtem Knopf, wie "Felder ansehen" daneben - die
          Statusspalte ist sticky und hat schon zweimal Knoepfe aus dem Bild
          geschoben, wenn sie breiter wurde. */}
      <SubmitButton
        variant="ghost"
        size="sm"
        pendingLabel="Wird getrennt …"
        className="h-auto whitespace-nowrap gap-1 px-0 py-0 text-xs font-normal text-muted-foreground underline underline-offset-2 hover:bg-transparent hover:text-foreground"
      >
        <Undo2 className="h-3 w-3" aria-hidden />
        Zurück zu {seiten} Einzelseiten
      </SubmitButton>
      {/* `grund` ist bereits kundengrader Klartext aus der Service-Schicht
          (macheRueckgaengig) und wird unveraendert durchgereicht. */}
      {state.grund && (
        <p className="mt-1 max-w-[16rem] text-xs text-destructive" role="alert">
          {state.grund}
        </p>
      )}
    </form>
  );
}
