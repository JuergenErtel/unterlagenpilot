"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  erstkontaktVorbereitenAction,
  type ErstkontaktVorbereitenState,
} from "@/lib/actions/erstkontakt-actions";

/**
 * „Erstkontakt vorbereiten“ – als actionSlot der Prioritätsleiter-Karte
 * (next-step.ts, Stufe `erstkontakt_vorbereiten`), verdrahtet in der
 * Fallseite. Kein next-step-Link, weil das Vorbereiten eine Server-Action
 * ist, keine Navigation.
 *
 * Eigene Client-Komponente, damit ein Fehlschlag als Zeile unter dem Knopf
 * landet statt als Next.js-Fehlerseite: Scheitert die Linkanlage, soll der
 * Vermittler auf der Fallseite bleiben und es erneut versuchen koennen.
 * Gleiches Muster wie `FinLinkRefreshButton`.
 */
export function ErstkontaktVorbereitenButton({
  caseId,
  erneuern = false,
}: {
  caseId: string;
  /**
   * Vorhandenen, nicht versendeten Entwurf verwerfen und neu erzeugen.
   *
   * Noetig, weil ein Entwurf den Datenstand seiner Entstehung einfriert:
   * Wird danach ein Einkommen nachgetragen oder eine Beschaeftigungsart
   * korrigiert, stimmt seine Unterlagenliste nicht mehr.
   */
  erneuern?: boolean;
}) {
  const [state, action] = useActionState<ErstkontaktVorbereitenState, FormData>(
    erstkontaktVorbereitenAction,
    {}
  );

  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="caseId" value={caseId} />
      {erneuern && <input type="hidden" name="erneuern" value="1" />}
      <SubmitButton
        size={erneuern ? "sm" : "lg"}
        variant={erneuern ? "outline" : "default"}
        className="w-full justify-center"
        pendingLabel={erneuern ? "Wird neu erzeugt …" : "Wird vorbereitet …"}
      >
        {erneuern ? "Entwurf neu erzeugen" : "Erstkontakt vorbereiten"}
      </SubmitButton>
      {state.success && <p className="text-xs text-success">{state.success}</p>}
      {state.error && (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
