"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  portalAbnehmenAction,
  portalFeedbackAction,
  portalHinweiseAction,
  portalKontaktAction,
  portalKontaktEntfernenAction,
  portalNachbearbeitungAction,
  portalRueckfrageBeantwortenAction,
  portalUploadLinkAction,
} from "@/lib/actions/backoffice-portal";
import type { AktionsErgebnis } from "@/lib/actions/backoffice";

/**
 * Die kleinen Formulare des Auftraggeberportals. Jedes ruft genau eine
 * Portal-Action, zeigt deren Fehler an und bestaetigt den Erfolg mit einem
 * Satz. Die Seite selbst wird durch revalidatePath in der Action aktualisiert.
 */

function Meldung({ state, okText }: { state: AktionsErgebnis; okText: string }) {
  if (state.error) {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success" role="status">
        {okText}
      </p>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------

export function HinweiseForm({ auftragId, hinweise, gesperrt }: { auftragId: string; hinweise: string | null; gesperrt: boolean }) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(portalHinweiseAction, {});
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="auftragId" value={auftragId} />
      <div className="space-y-1.5">
        <Label htmlFor="hinweise">Was das Backoffice wissen sollte</Label>
        <Textarea
          id="hinweise"
          name="hinweise"
          rows={4}
          defaultValue={hinweise ?? ""}
          disabled={gesperrt}
          placeholder="Besonderheiten des Falls, Zielbank, Terminwünsche, Vorabsprachen …"
        />
      </div>
      <Meldung state={state} okText="Hinweise gespeichert." />
      {gesperrt ? (
        <p className="text-xs text-muted-foreground">Der Auftrag ist abgeschlossen; Hinweise lassen sich nicht mehr ändern.</p>
      ) : (
        <SubmitButton variant="outline" size="sm" pendingLabel="Wird gespeichert …">
          Hinweise speichern
        </SubmitButton>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------

export function RueckfrageAntwortForm({ auftragId, rueckfrageId }: { auftragId: string; rueckfrageId: string }) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(portalRueckfrageBeantwortenAction, {});
  if (state.ok) return <Meldung state={state} okText="Antwort übermittelt. Das Backoffice arbeitet weiter." />;
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="auftragId" value={auftragId} />
      <input type="hidden" name="rueckfrageId" value={rueckfrageId} />
      <Label htmlFor={`antwort-${rueckfrageId}`} className="sr-only">
        Antwort
      </Label>
      <Textarea id={`antwort-${rueckfrageId}`} name="antwort" rows={3} required placeholder="Ihre Antwort an das Backoffice" />
      <Meldung state={state} okText="Antwort übermittelt." />
      <SubmitButton size="sm" pendingLabel="Wird gesendet …">
        Antwort senden
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------------

export function AbnahmeForm({ auftragId }: { auftragId: string }) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(portalAbnehmenAction, {});
  if (state.ok) return <Meldung state={state} okText="Ergebnis abgenommen. Vielen Dank." />;
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="auftragId" value={auftragId} />
      <div className="space-y-1.5">
        <Label htmlFor="kommentar">Kommentar zur Abnahme (optional)</Label>
        <Textarea id="kommentar" name="kommentar" rows={2} placeholder="Was gut war, was beim nächsten Mal anders sein sollte." />
      </div>
      <Meldung state={state} okText="Ergebnis abgenommen." />
      <SubmitButton size="sm" pendingLabel="Wird abgenommen …">
        Ergebnis abnehmen
      </SubmitButton>
    </form>
  );
}

export function NachbearbeitungForm({ auftragId }: { auftragId: string }) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(portalNachbearbeitungAction, {});
  const [offen, setOffen] = useState(false);
  if (state.ok) return <Meldung state={state} okText="Nachbearbeitung angefordert. Das Backoffice meldet sich." />;
  if (!offen) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOffen(true)}>
        Nachbearbeitung anfordern
      </Button>
    );
  }
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="auftragId" value={auftragId} />
      <div className="space-y-1.5">
        <Label htmlFor="grund">Was soll nachgebessert werden?</Label>
        <Textarea id="grund" name="grund" rows={3} required placeholder="Bitte konkret: welche Position, welches Dokument, was fehlt." />
      </div>
      <Meldung state={state} okText="Nachbearbeitung angefordert." />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" variant="outline" pendingLabel="Wird gesendet …">
          Nachbearbeitung anfordern
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOffen(false)}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

export function FeedbackForm({ auftragId, bewertung, text }: { auftragId: string; bewertung: number | null; text: string | null }) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(portalFeedbackAction, {});
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="auftragId" value={auftragId} />
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Wie zufrieden sind Sie mit dem Ergebnis?</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent/60 has-[:checked]:border-primary has-[:checked]:bg-primary/10">
              <input type="radio" name="bewertung" value={n} defaultChecked={bewertung === n} required className="sr-only" />
              {n}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">1 = unzufrieden, 5 = sehr zufrieden</p>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="feedbackText">Anmerkung (optional)</Label>
        <Textarea id="feedbackText" name="text" rows={2} defaultValue={text ?? ""} />
      </div>
      <Meldung state={state} okText="Vielen Dank für Ihre Rückmeldung." />
      <SubmitButton variant="outline" size="sm" pendingLabel="Wird gespeichert …">
        {bewertung ? "Rückmeldung aktualisieren" : "Rückmeldung senden"}
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------------

export function UploadLinkForm({ auftragId, gesperrt }: { auftragId: string; gesperrt: boolean }) {
  const [state, formAction] = useActionState<{ url?: string; error?: string }, FormData>(portalUploadLinkAction, {});
  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="auftragId" value={auftragId} />
        <div className="space-y-1.5">
          <Label htmlFor="tage">Gültig für</Label>
          <div className="flex items-center gap-2">
            <Input id="tage" name="tage" type="number" min={1} max={60} defaultValue={14} className="w-20" disabled={gesperrt} />
            <span className="text-sm text-muted-foreground">Tage</span>
          </div>
        </div>
        <SubmitButton variant="outline" size="sm" disabled={gesperrt} pendingLabel="Wird erzeugt …">
          Upload-Link erzeugen
        </SubmitButton>
      </form>
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.url ? (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Dieser Link wird nur einmal angezeigt. Bitte jetzt kopieren und an den Antragsteller weitergeben.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-card px-2 py-1 text-xs">{state.url}</code>
            <CopyButton value={state.url} label="Link kopieren" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export interface KontaktKandidat {
  id: string;
  name: string;
  email: string;
}

export function KontaktForm({ auftraggeberId, nutzer }: { auftraggeberId: string; nutzer: KontaktKandidat[] }) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(portalKontaktAction, {});
  if (nutzer.length === 0) {
    return <p className="text-sm text-muted-foreground">Alle aktiven Nutzer Ihrer Organisation sind bereits als Kontakt hinterlegt.</p>;
  }
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="auftraggeberId" value={auftraggeberId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`userId-${auftraggeberId}`}>Mitarbeiter</Label>
          <select id={`userId-${auftraggeberId}`} name="userId" required defaultValue="" className="feld h-9 w-full">
            <option value="" disabled>
              Bitte wählen …
            </option>
            {nutzer.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="darfAlleAuftraegeSehen" defaultChecked className="h-4 w-4 rounded border" />
          Darf alle Aufträge sehen
        </label>
      </div>
      <Meldung state={state} okText="Mitarbeiter hinzugefügt." />
      <SubmitButton size="sm" variant="outline" pendingLabel="Wird gespeichert …">
        Als Kontakt hinzufügen
      </SubmitButton>
    </form>
  );
}

export function KontaktEntfernenButton({ auftraggeberId, kontaktId }: { auftraggeberId: string; kontaktId: string }) {
  const [pending, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await portalKontaktEntfernenAction(auftraggeberId, kontaktId);
            setFehler(r.error ?? null);
          })
        }
      >
        {pending ? "Wird entfernt …" : "Entfernen"}
      </Button>
      {fehler ? (
        <p className="text-xs text-destructive" role="alert">
          {fehler}
        </p>
      ) : null}
    </div>
  );
}
