"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { starteAnfrage } from "@/lib/actions/anfrage";
import { SchrittFelder, istEinzelneAuswahl } from "@/components/self-disclosure/schritt-felder";
import type { AnfrageStart } from "@/lib/leadformular/service";
import type { Feld } from "@/lib/self-disclosure/types";

function WeiterButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Einen Moment …" : "Los geht's"}
    </Button>
  );
}

export function EinstiegFormular({ slug, frage, felder }: { slug: string; frage: string; felder: Feld[] }) {
  const [state, action] = useActionState<AnfrageStart, FormData>(
    async (_prev, fd) => (await starteAnfrage(slug, fd)) ?? {},
    {}
  );

  if (state.danke) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <h2 className="text-lg font-semibold">Vielen Dank!</h2>
        <p className="mt-2 text-sm text-muted-foreground">Ihre Anfrage ist eingegangen.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <h1 className="text-2xl font-semibold">{frage}</h1>
      {/* Honigtoepfchen: fuer Menschen unsichtbar, fuer einfache Bots
          verlockend. Kein display:none – manche Bots ueberspringen das. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <SchrittFelder felder={felder} defaults={{}} fieldErrors={state.fieldErrors} />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {/* Eine einzelne Auswahl sendet mit dem Klick auf die Kachel bereits ab
          (siehe SchrittFelder) – ein zweiter Knopf darunter waere doppelt. */}
      {!istEinzelneAuswahl(felder) && <WeiterButton />}
    </form>
  );
}
