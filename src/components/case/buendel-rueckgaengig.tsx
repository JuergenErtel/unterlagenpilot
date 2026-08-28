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
 * eine falsche Gruppierung eine Sackgasse. Der Knopf selbst erscheint nur,
 * solange `offen` gilt - danach hat der Vermittler entschieden, und der Weg
 * zurueck fuehrt ueber "Freigabe zuruecknehmen".
 *
 * Eigener `useActionState` statt eines nackten `<form action>`, wie schon bei
 * `buendelZusammenfuegenAction`/`seitenZusammenfuegenAction`: Ein
 * fehlgeschlagenes Rueckgaengigmachen (Dokument inzwischen andernorts
 * freigegeben oder entfernt) darf nicht stillschweigend im Leeren verpuffen.
 *
 * ABER: `offen` darf NICHT steuern, ob die Komponente ueberhaupt gerendert
 * wird - genau das war der Fehler. `offen` ist dieselbe Bedingung, die
 * `macheRueckgaengig` serverseitig prueft und bei einer Ablehnung nennt.
 * Steuerte sie zugleich das Mounting, wuerde ein zwischenzeitlich (zweiter
 * Tab, zweites Rueckgaengig) geaendertes `offen` beim naechsten Rendern die
 * ganze Komponente verschwinden lassen - und mit ihr den gerade gesetzten
 * `state.grund`: Klick, und sichtbar passiert nichts, obwohl gerade eine
 * Meldung gesetzt wurde. Deshalb bleibt die Komponente gemountet, solange der
 * Aufrufer sie fuer diese Zeile ueberhaupt zeigt (siehe page.tsx: die dortige
 * Bedingung ist `_count.quellseiten > 0`, eine Eigenschaft, die sich fuer ein
 * gegebenes Dokument nie mehr aendert), und blendet nur den Knopf selbst nach
 * `offen` aus - die Meldung bleibt lesbar, auch wenn `offen` gerade auf false
 * gekippt ist.
 */
export function BuendelRueckgaengig({
  caseId,
  documentId,
  seiten,
  offen,
}: {
  caseId: string;
  documentId: string;
  seiten: number;
  /** Ob "Rueckgaengig" fuer dieses Dokument gerade ueberhaupt in Frage kommt. */
  offen: boolean;
}) {
  const [state, rueckgaengig] = useActionState<BuendelRueckgaengigState, FormData>(
    buendelRueckgaengigAction,
    {}
  );

  if (!offen && !state.grund) return null;

  return (
    <form action={rueckgaengig} className="min-w-0">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="documentId" value={documentId} />
      {offen && (
        // Textlink statt gerahmtem Knopf, wie "Felder ansehen" daneben - die
        // Statusspalte ist sticky und hat schon zweimal Knoepfe aus dem Bild
        // geschoben, wenn sie breiter wurde.
        <SubmitButton
          variant="ghost"
          size="sm"
          pendingLabel="Wird getrennt …"
          className="h-auto whitespace-nowrap gap-1 px-0 py-0 text-xs font-normal text-muted-foreground underline underline-offset-2 hover:bg-transparent hover:text-foreground"
        >
          <Undo2 className="h-3 w-3" aria-hidden />
          Zurück zu {seiten} Einzelseiten
        </SubmitButton>
      )}
      {/* `grund` ist bereits kundengrader Klartext aus der Service-Schicht
          (macheRueckgaengig) und wird unveraendert durchgereicht. Steht
          absichtlich AUSSERHALB der `offen`-Bedingung oben - siehe
          Komponentenkommentar. */}
      {state.grund && (
        <p className="mt-1 max-w-[16rem] text-xs text-destructive" role="alert">
          {state.grund}
        </p>
      )}
    </form>
  );
}
