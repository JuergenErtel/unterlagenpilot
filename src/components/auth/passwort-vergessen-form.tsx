"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetAnfordern, type PasswortState } from "@/lib/actions/passwort-actions";

export function PasswortVergessenForm() {
  const [state, formAction, pending] = useActionState<PasswortState, FormData>(resetAnfordern, {});

  if (state.ok) {
    return (
      <p className="text-sm text-muted-foreground">
        Wenn für diese Adresse ein Zugang besteht, haben wir Ihnen eine E-Mail geschickt. Der Link
        ist eine Stunde gültig.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Wird gesendet …" : "Link anfordern"}
      </Button>
    </form>
  );
}
