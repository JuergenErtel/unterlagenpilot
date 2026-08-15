"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { speichereAntwort, type SchrittState } from "@/lib/actions/self-disclosure";
import { SchrittFelder, istEinzelneAuswahl } from "@/components/self-disclosure/schritt-felder";
import type { Feld } from "@/lib/self-disclosure/types";

/**
 * Der Knopf sagt, was passiert: Leerlassen ist erlaubt, soll aber sichtbar
 * sein. Deshalb „Überspringen" statt „Weiter", solange nichts eingetragen ist.
 */
function WeiterButton({ etwasEingetragen }: { etwasEingetragen: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Einen Moment …" : etwasEingetragen ? "Weiter" : "Überspringen"}
    </Button>
  );
}

export function StepForm({
  token,
  schrittId,
  frage,
  hinweis,
  felder,
  defaults,
}: {
  token: string;
  schrittId: string;
  frage: string;
  hinweis?: string;
  felder: Feld[];
  defaults: Record<string, string>;
}) {
  const [state, action] = useActionState<SchrittState, FormData>(
    async (_prev, fd) => (await speichereAntwort(token, schrittId, fd)) ?? {},
    {}
  );
  const [eingetragen, setEingetragen] = useState(
    Object.values(defaults).some((v) => v !== "")
  );

  // Eine einzelne Auswahl bekommt die großen Kacheln von FinLink und schickt
  // direkt ab – ein Klick, ein Schritt weiter.
  const einzelneAuswahl = istEinzelneAuswahl(felder);

  return (
    <form
      action={action}
      className="space-y-6"
      onChange={(e) => {
        const werte = Array.from(new FormData(e.currentTarget).values());
        setEingetragen(werte.some((v) => String(v).trim() !== ""));
      }}
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{frage}</h1>
        {hinweis && <p className="text-sm text-muted-foreground">{hinweis}</p>}
      </div>

      <SchrittFelder felder={felder} defaults={defaults} fieldErrors={state.fieldErrors} />

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {!einzelneAuswahl && <WeiterButton etwasEingetragen={eingetragen} />}
    </form>
  );
}
