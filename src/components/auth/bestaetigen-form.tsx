"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { bestaetigeEmailAction, type BestaetigungState } from "@/lib/actions/registrierung";

/**
 * Der Bestaetigungslink wird erst durch diesen Knopf eingeloest – nie durch den
 * blossen Aufruf der Seite. Link-Scanner in Firmen-Mailservern (Outlook Safe
 * Links, Proofpoint) rufen jede URL aus einer Mail ab; ein beim Rendern
 * verbrauchtes Token waere entwertet, bevor ein Mensch klickt.
 */
export function BestaetigenForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<BestaetigungState, FormData>(
    bestaetigeEmailAction,
    {}
  );

  if (state.ok) {
    return (
      <div className="space-y-3">
        <p className="text-sm" role="status">
          Vielen Dank. Wir prüfen Ihre Anmeldung jetzt von Hand und melden uns per E-Mail – in der
          Regel innerhalb eines Werktags.
        </p>
        <Link href="/login" className="text-sm underline">
          Zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}{" "}
          <Link href="/registrieren" className="underline">
            Neuen Link anfordern
          </Link>
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Wird bestätigt …" : "Adresse bestätigen"}
      </Button>
    </form>
  );
}
