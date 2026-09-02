"use client";

import { useActionState } from "react";
import { plattformBackofficeFlagAction } from "@/lib/actions/backoffice-admin";
import type { AktionsErgebnis } from "@/lib/actions/backoffice";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Ein Knopf je Organisation, der den jeweils ANDEREN Wert des Flags sendet:
 * Ist das Backoffice an, heisst er "Abschalten" und schickt "nein" - und
 * umgekehrt. So gibt es keinen Zustand, in dem der Knopf das Bestehende
 * noch einmal setzt.
 */
export function BackofficeFlagForm({ organizationId, aktiv }: { organizationId: string; aktiv: boolean }) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(plattformBackofficeFlagAction, {});
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="enabled" value={aktiv ? "nein" : "ja"} />
      <SubmitButton size="sm" variant={aktiv ? "outline" : "default"} pendingLabel="…">
        {aktiv ? "Abschalten" : "Freischalten"}
      </SubmitButton>
      {state.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
