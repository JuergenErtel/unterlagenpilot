"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Feld } from "@/lib/self-disclosure/types";

/**
 * Eine einzelne Auswahl bekommt die großen Kacheln von FinLink und schickt
 * beim Klick direkt ab – kein Extraklick auf einen "Weiter"-Knopf. Gilt auch
 * für den allerersten Schritt (`finanzierungsart`), der genau dieser Fall ist.
 */
export function istEinzelneAuswahl(felder: Feld[]): boolean {
  return felder.length === 1 && felder[0]!.typ === "auswahl";
}

/**
 * Die Feld-Darstellung eines Schritts – geteilt zwischen der Kundenstrecke
 * (`StepForm`) und dem öffentlichen Einstieg (`EinstiegFormular`), damit sich
 * der erste Schritt nicht anders anfühlt als die folgenden. Beide Aufrufer
 * betten dies in ihr eigenes `<form action={...}>` ein; hier steht nur die
 * Darstellung, kein Absende- oder Zustandsverhalten.
 */
export function SchrittFelder({
  felder,
  defaults,
  fieldErrors,
}: {
  felder: Feld[];
  defaults: Record<string, string>;
  fieldErrors?: Record<string, string>;
}) {
  if (istEinzelneAuswahl(felder)) {
    return (
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
    );
  }

  return (
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
          {fieldErrors?.[feld.id] && (
            <p className="text-xs text-destructive">{fieldErrors[feld.id]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
