"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { speichereAntwort, type SchrittState } from "@/lib/actions/self-disclosure";
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
  const einzelneAuswahl = felder.length === 1 && felder[0]!.typ === "auswahl";

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

      {einzelneAuswahl ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {felder[0]!.optionen!.map((o) => (
              <button
                key={o.wert}
                type="submit"
                name={felder[0]!.id}
                value={o.wert}
                className={`rounded-xl border p-5 text-left text-base transition hover:border-primary hover:bg-muted/50 ${
                  defaults[felder[0]!.id] === o.wert ? "border-primary bg-muted/40" : ""
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {/* Auch eine Auswahl darf offen bleiben. */}
          <button
            type="submit"
            name={felder[0]!.id}
            value=""
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            Überspringen
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {felder.map((feld) => (
            <div key={feld.id} className="space-y-1.5">
              <Label htmlFor={feld.id}>{feld.label}</Label>
              {feld.typ === "auswahl" ? (
                <select
                  id={feld.id}
                  name={feld.id}
                  defaultValue={defaults[feld.id] ?? ""}
                  className="h-11 w-full rounded-md border bg-background px-3"
                >
                  <option value="">– keine Angabe –</option>
                  {feld.optionen!.map((o) => (
                    <option key={o.wert} value={o.wert}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : feld.typ === "ja_nein" ? (
                <select
                  id={feld.id}
                  name={feld.id}
                  defaultValue={defaults[feld.id] ?? ""}
                  className="h-11 w-full rounded-md border bg-background px-3"
                >
                  <option value="">– keine Angabe –</option>
                  <option value="ja">Ja</option>
                  <option value="nein">Nein</option>
                </select>
              ) : (
                <Input
                  id={feld.id}
                  name={feld.id}
                  type={feld.typ === "datum" ? "date" : "text"}
                  inputMode={feld.typ === "betrag" || feld.typ === "zahl" ? "decimal" : undefined}
                  defaultValue={defaults[feld.id] ?? ""}
                />
              )}
              {feld.hinweis && <p className="text-xs text-muted-foreground">{feld.hinweis}</p>}
              {state.fieldErrors?.[feld.id] && (
                <p className="text-xs text-destructive">{state.fieldErrors[feld.id]}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {!einzelneAuswahl && <WeiterButton etwasEingetragen={eingetragen} />}
    </form>
  );
}
