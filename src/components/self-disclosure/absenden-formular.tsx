"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendeAb } from "@/lib/actions/self-disclosure";
import { KONTAKT_LABELS, type Kontaktangabe } from "@/lib/self-disclosure/pflichtangaben";

interface AbsendenState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function AbsendenButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Einen Moment …" : "Angaben absenden"}
    </Button>
  );
}

/**
 * Schickt den Bogen ab. Als Client-Komponente über `useActionState`, damit
 * eine Ablehnung – fehlende Einwilligung, eine E-Mail ohne "@" – sichtbar
 * wird: Das reine `<input required>` fängt nur leere Felder ab, nicht die
 * serverseitige Prüfung in `sendeAb`. Ohne diesen Umweg rendert die Seite bei
 * einem Fehler einfach aus der Datenbank neu, ohne Meldung – und mit ihr das
 * Getippte weg, eine Schleife ohne Hinweis für den Kunden.
 */
export function AbsendenFormular({
  token,
  zeigeKontaktblock,
  fehlend,
}: {
  token: string;
  /** false beim fallgebundenen Bogen – dort gibt es keinen Kontaktblock. */
  zeigeKontaktblock: boolean;
  fehlend: Kontaktangabe[];
}) {
  const [state, action] = useActionState<AbsendenState, FormData>(
    async (_prev, fd) => (await sendeAb(token, fd)) ?? {},
    {}
  );

  return (
    <form action={action} className="space-y-4">
      {zeigeKontaktblock && (
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Wie erreichen wir Sie?</h2>
          {fehlend.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Diese Angaben brauchen wir, um Ihnen antworten zu können.
            </p>
          )}
          {fehlend.map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={k}>{KONTAKT_LABELS[k]}</Label>
              <Input id={k} name={k} required />
              {state.fieldErrors?.[k] && (
                <p className="text-xs text-destructive">{state.fieldErrors[k]}</p>
              )}
            </div>
          ))}
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="einwilligung" value="ja" required className="mt-0.5 h-4 w-4" />
            <span>
              Ich bin damit einverstanden, dass meine Angaben zur Bearbeitung meiner Anfrage
              gespeichert und verarbeitet werden (
              <a href="/datenschutz" className="underline">
                Datenschutzerklärung
              </a>
              ).
            </span>
          </label>
        </div>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <AbsendenButton />
    </form>
  );
}
