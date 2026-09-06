"use client";

import { useActionState, useState, useTransition } from "react";
import { einreichungsLinkDeaktivierenAction, einreichungsLinkErzeugenAction } from "@/lib/actions/backoffice";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { CopyButton } from "@/components/ui/copy-button";

export interface EinreichungsLinkStandAnzeige {
  aktiv: boolean;
  seit: string | null;
  zuletztGenutzt: string | null;
  einreichungen: number;
}

function datum(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Manager-Block "Einreichungslink" auf der Auftraggeberseite. Der Klartext-
 * Link erscheint genau einmal nach dem Erzeugen; danach gibt es nur noch
 * Stand, Erneuern und Deaktivieren. Es wird nichts versendet - der Manager
 * gibt den Link dem Auftraggeber persoenlich.
 */
export function EinreichungslinkBlock({ auftraggeberId, stand }: { auftraggeberId: string; stand: EinreichungsLinkStandAnzeige }) {
  const [state, formAction] = useActionState(einreichungsLinkErzeugenAction, {} as { url?: string; error?: string });
  const [laeuft, starte] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  return (
    <div className="space-y-3 text-sm">
      {stand.aktiv ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Aktiv seit</dt>
          <dd>{datum(stand.seit)}</dd>
          <dt className="text-muted-foreground">Zuletzt genutzt</dt>
          <dd>{datum(stand.zuletztGenutzt)}</dd>
          <dt className="text-muted-foreground">Einreichungen</dt>
          <dd>{stand.einreichungen}</dd>
        </dl>
      ) : (
        <p className="text-muted-foreground">Kein aktiver Link.</p>
      )}

      {state.url && (
        <div className="space-y-1.5 rounded-md border border-ai/30 bg-ai/[0.05] p-3">
          <p className="text-xs font-medium">Nur jetzt sichtbar. Kopieren und dem Auftraggeber persönlich geben.</p>
          <div className="flex items-center gap-2">
            <input readOnly value={state.url} className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton value={state.url} label="Link kopieren" />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <form action={formAction}>
          <input type="hidden" name="auftraggeberId" value={auftraggeberId} />
          <SubmitButton size="sm" variant={stand.aktiv ? "outline" : "default"} pendingLabel="Wird erzeugt …">
            {stand.aktiv ? "Link erneuern" : "Link erzeugen"}
          </SubmitButton>
        </form>
        {stand.aktiv && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={laeuft}
            onClick={() => {
              if (!window.confirm("Einreichungslink deaktivieren? Der Auftraggeber kann darüber dann nichts mehr einreichen.")) return;
              starte(async () => {
                const r = await einreichungsLinkDeaktivierenAction(auftraggeberId);
                setFehler(r.error ?? null);
              });
            }}
          >
            Deaktivieren
          </Button>
        )}
      </div>
      {stand.aktiv && state.url == null && (
        <p className="text-xs text-muted-foreground">Erneuern ersetzt den bestehenden Link; der alte wird sofort ungültig.</p>
      )}
      {(state.error || fehler) && (
        <p role="alert" className="text-xs text-destructive">
          {state.error ?? fehler}
        </p>
      )}
    </div>
  );
}
