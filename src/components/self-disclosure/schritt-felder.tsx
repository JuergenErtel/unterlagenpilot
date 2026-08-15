"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { personenSchluessel } from "@/lib/self-disclosure/navigation";
import type { Feld } from "@/lib/self-disclosure/types";

/**
 * Eine einzelne Auswahl bekommt die großen Kacheln von FinLink und schickt
 * beim Klick direkt ab – kein Extraklick auf einen "Weiter"-Knopf. Gilt auch
 * für den allerersten Schritt (`finanzierungsart`), der genau dieser Fall ist.
 *
 * Bei zwei Spalten NICHT: Ein Klick sendet die ganze Seite ab, bevor die
 * zweite Spalte überhaupt ausgefüllt ist – dort bleibt es bei der normalen
 * Auswahlliste mit explizitem "Weiter".
 */
export function istEinzelneAuswahl(felder: Feld[], mehrspaltig?: boolean): boolean {
  return !mehrspaltig && felder.length === 1 && felder[0]!.typ === "auswahl";
}

/**
 * Die Feld-Darstellung eines Schritts – geteilt zwischen der Kundenstrecke
 * (`StepForm`) und dem öffentlichen Einstieg (`EinstiegFormular`), damit sich
 * der erste Schritt nicht anders anfühlt als die folgenden. Beide Aufrufer
 * betten dies in ihr eigenes `<form action={...}>` ein; hier steht nur die
 * Darstellung, kein Absende- oder Zustandsverhalten.
 *
 * `schrittId` und `person` bauen den vollständigen Antwortschlüssel für Name
 * und ID jedes Eingabefelds (`personenSchluessel`) – damit die Server-Aktion
 * bei zwei Spalten beide Antworten auseinanderhält, statt eine stillschweigend
 * zu verlieren (siehe `schrittSchema`).
 */
export function SchrittFelder({
  schrittId,
  person,
  mehrspaltig,
  felder,
  defaults,
  fieldErrors,
}: {
  schrittId: string;
  person?: 1 | 2;
  mehrspaltig?: boolean;
  felder: Feld[];
  defaults: Record<string, string>;
  fieldErrors?: Record<string, string>;
}) {
  const name = (feldId: string) => personenSchluessel(schrittId, feldId, person);

  if (istEinzelneAuswahl(felder, mehrspaltig)) {
    const feldName = name(felder[0]!.id);
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {felder[0]!.optionen!.map((o) => (
            <button
              key={o.wert}
              type="submit"
              name={feldName}
              value={o.wert}
              className={`rounded-xl border p-5 text-left text-base transition hover:border-primary hover:bg-muted/50 ${
                defaults[feldName] === o.wert ? "border-primary bg-muted/40" : ""
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {/* Auch eine Auswahl darf offen bleiben. */}
        <button
          type="submit"
          name={feldName}
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
      {felder.map((feld) => {
        const feldName = name(feld.id);
        return (
          <div key={feld.id} className="space-y-1.5">
            <Label htmlFor={feldName}>{feld.label}</Label>
            {feld.typ === "auswahl" ? (
              <select
                id={feldName}
                name={feldName}
                defaultValue={defaults[feldName] ?? ""}
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
                id={feldName}
                name={feldName}
                defaultValue={defaults[feldName] ?? ""}
                className="h-11 w-full rounded-md border bg-background px-3"
              >
                <option value="">– keine Angabe –</option>
                <option value="ja">Ja</option>
                <option value="nein">Nein</option>
              </select>
            ) : (
              <Input
                id={feldName}
                name={feldName}
                type={feld.typ === "datum" ? "date" : "text"}
                inputMode={feld.typ === "betrag" || feld.typ === "zahl" ? "decimal" : undefined}
                defaultValue={defaults[feldName] ?? ""}
              />
            )}
            {feld.hinweis && <p className="text-xs text-muted-foreground">{feld.hinweis}</p>}
            {fieldErrors?.[feldName] && (
              <p className="text-xs text-destructive">{fieldErrors[feldName]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
