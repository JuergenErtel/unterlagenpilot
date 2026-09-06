"use client";

import { useActionState, useState } from "react";
import { einreichungAbsendenAction, type EinreichungState } from "@/lib/actions/einreichung";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

interface Auftragsart {
  key: string;
  label: string;
  beschreibung: string;
}

/**
 * Oeffentliches Einreichungsformular. Serverseitige Pruefung entscheidet;
 * `required` am Feld ist nur Komfort. Die Leistungsbausteine werden nicht
 * gezeigt - sie sind durch die Auftragsart belegt, das Backoffice passt sie
 * bei Bedarf an.
 */
export function EinreichungForm({ token, auftragsarten }: { token: string; auftragsarten: Auftragsart[] }) {
  const [state, formAction] = useActionState<EinreichungState, FormData>(einreichungAbsendenAction.bind(null, token), {});
  const [auftragsart, setAuftragsart] = useState<string>(auftragsarten[0]?.key ?? "");
  const fehler = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {/* Honigtoepfchen: fuer Menschen unsichtbar, fuer einfache Bots
          verlockend. Kein display:none - manche Bots ueberspringen das.
          Nicht "website" genannt: Passwortmanager fuellen so ein Feld gern. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="firmenzusatz">Firmenzusatz</label>
        <input id="firmenzusatz" name="firmenzusatz" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Antragsteller</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Feld id="vorname1" label="Vorname" fehler={fehler.vorname1} />
          <Feld id="nachname1" label="Nachname" fehler={fehler.nachname1} required />
          <Feld id="email1" label="E-Mail (optional)" type="email" fehler={fehler.email1} />
          <Feld id="phone1" label="Telefon (optional)" fehler={fehler.phone1} />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Zweiter Antragsteller (optional)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Feld id="vorname2" label="Vorname" />
          <Feld id="nachname2" label="Nachname" />
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Auftragsart</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {auftragsarten.map((a) => {
            const gewaehlt = a.key === auftragsart;
            return (
              <label
                key={a.key}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-sm transition-colors",
                  gewaehlt ? "border-primary bg-primary/5" : "hover:border-foreground/25"
                )}
              >
                <input
                  type="radio"
                  name="auftragsart"
                  value={a.key}
                  checked={gewaehlt}
                  onChange={() => setAuftragsart(a.key)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{a.label}</span>
                  <span className="block text-xs text-muted-foreground">{a.beschreibung}</span>
                </span>
              </label>
            );
          })}
        </div>
        {fehler.auftragsart && <p className="text-xs text-destructive">{fehler.auftragsart}</p>}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Referenz und Hinweise</legend>
        <Feld id="referenz" label="Ihre Vorgangsnummer (optional)" />
        <div className="space-y-1.5">
          <Label htmlFor="hinweise">Hinweise für das Backoffice (optional)</Label>
          <Textarea id="hinweise" name="hinweise" rows={4} placeholder="Besonderheiten des Falls, Zielbank, Eile …" />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Ansprechperson bei Ihnen</legend>
        <p className="text-xs text-muted-foreground">Rückfragen und das Ergebnis erreichen Sie über diese Person.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Feld id="ansprechName" label="Name" fehler={fehler.ansprechName} required />
          <Feld id="ansprechEmail" label="E-Mail" type="email" />
          <Feld id="ansprechPhone" label="Telefon" />
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton size="lg" className="w-full" pendingLabel="Wird eingereicht …">
        Auftrag einreichen
      </SubmitButton>
    </form>
  );
}

function Feld({
  id,
  label,
  type = "text",
  fehler,
  required,
}: {
  id: string;
  label: string;
  type?: string;
  fehler?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} required={required} aria-invalid={fehler ? true : undefined} />
      {fehler && <p className="text-xs text-destructive">{fehler}</p>}
    </div>
  );
}
