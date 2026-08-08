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
export function ErstkontaktVorbereitenButton({ caseId }: { caseId: string }) {
  const [state, action] = useActionState<ErstkontaktVorbereitenState, FormData>(
    erstkontaktVorbereitenAction,
    {}
  );

  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="caseId" value={caseId} />
      <SubmitButton size="lg" className="w-full justify-center" pendingLabel="Wird vorbereitet …">
        Erstkontakt vorbereiten
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
