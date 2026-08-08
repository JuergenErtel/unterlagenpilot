"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { einladenAction, type EinladungState } from "@/lib/actions/invite-actions";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/domain/enums";

export function EinladenForm({ rollen }: { rollen: UserRole[] }) {
  const [state, formAction, pending] = useActionState<EinladungState, FormData>(einladenAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-Mail</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rolle">Rolle</Label>
        <select
          id="rolle"
          name="rolle"
          required
          defaultValue=""
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Bitte wählen …
          </option>
          {rollen.map((rolle) => (
            <option key={rolle} value={rolle}>
              {USER_ROLE_LABELS[rolle]}
            </option>
          ))}
        </select>
      </div>
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400" role="status">
          Einladung verschickt.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Wird eingeladen …" : "Einladen"}
      </Button>
    </form>
  );
}
