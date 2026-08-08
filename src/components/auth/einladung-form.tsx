"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { einladungEinloesenAction, type EinladungState } from "@/lib/actions/invite-actions";
import { PASSWORT_HINWEIS } from "@/lib/auth/passwort-regeln";

export function EinladungForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<EinladungState, FormData>(
    einladungEinloesenAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1.5">
        <Label htmlFor="passwort">Passwort</Label>
        <Input id="passwort" name="passwort" type="password" autoComplete="new-password" required />
        <p className="text-xs text-muted-foreground">{PASSWORT_HINWEIS}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wiederholung">Passwort wiederholen</Label>
        <Input
          id="wiederholung"
          name="wiederholung"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Wird eingerichtet …" : "Einladung annehmen"}
      </Button>
    </form>
  );
}
