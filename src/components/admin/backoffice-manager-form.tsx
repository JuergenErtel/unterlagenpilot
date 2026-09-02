"use client";

import { useActionState } from "react";
import { plattformManagerAction } from "@/lib/actions/backoffice-admin";
import type { AktionsErgebnis } from "@/lib/actions/backoffice";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * "Manager benennen": E-Mail eines aktiven Nutzers der Organisation. Der
 * erste Manager ist die einzige Rolle, die der Betreiber vergibt - alle
 * weiteren Rollen setzt der Manager selbst im Backoffice.
 */
export function BackofficeManagerForm({ organizationId }: { organizationId: string }) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(plattformManagerAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="email"
          type="email"
          required
          placeholder="E-Mail des Nutzers"
          aria-label="E-Mail des künftigen Managers"
          className="h-8 w-56 text-sm"
        />
        <SubmitButton size="sm" variant="outline" pendingLabel="…">
          Manager benennen
        </SubmitButton>
      </div>
      {state.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
      {state.ok && !state.error && <p className="text-xs text-muted-foreground">Gespeichert.</p>}
    </form>
  );
}
