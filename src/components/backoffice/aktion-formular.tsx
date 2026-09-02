"use client";

import { useActionState, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { AktionsErgebnis } from "@/lib/actions/backoffice";

/**
 * Zwei kleine Client-Bausteine, mit denen die Backoffice-Seiten alle
 * Formulare bauen: ein Formular mit useActionState und ein Knopf, der eine
 * gebundene Server Action ohne Formular ausloest. Beide zeigen Fehler als
 * Text neben dem Knopf - keine Aktion verschwindet stumm.
 */

export type FormAktion = (prev: AktionsErgebnis, fd: FormData) => Promise<AktionsErgebnis>;

export function Rueckmeldung({ state, erfolg }: { state: AktionsErgebnis; erfolg?: string }) {
  if (state.error) {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.ok && erfolg) {
    return (
      <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success" role="status">
        {erfolg}
      </p>
    );
  }
  return null;
}

export function AktionFormular({
  aktion,
  felder,
  children,
  submitLabel,
  pendingLabel,
  erfolg,
  variant,
  size,
  className,
  knopfClassName,
  nebenKnopf,
  inline = false,
}: {
  aktion: FormAktion;
  /** Versteckte Felder (z. B. auftragId). */
  felder?: Record<string, string>;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  /** Text nach Erfolg; ohne Angabe bleibt das Formular still. */
  erfolg?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  knopfClassName?: string;
  /** Etwas neben dem Absendeknopf, z. B. ein Abbrechen. */
  nebenKnopf?: React.ReactNode;
  /** Alles in einer Zeile (Tabellenzellen, kleine Steuerungen). */
  inline?: boolean;
}) {
  const [state, formAction] = useActionState<AktionsErgebnis, FormData>(aktion, {});
  const versteckt = Object.entries(felder ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  if (inline) {
    return (
      <form action={formAction} className={cn("flex flex-wrap items-center gap-2", className)}>
        {versteckt}
        {children}
        <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel} className={knopfClassName}>
          {submitLabel}
        </SubmitButton>
        {nebenKnopf}
        {state.error && (
          <span className="text-xs text-destructive" role="alert">
            {state.error}
          </span>
        )}
        {state.ok && erfolg && (
          <span className="text-xs text-success" role="status">
            {erfolg}
          </span>
        )}
      </form>
    );
  }
  return (
    <form action={formAction} className={cn("space-y-3", className)}>
      {versteckt}
      {children}
      <Rueckmeldung state={state} erfolg={erfolg} />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel} className={knopfClassName}>
          {submitLabel}
        </SubmitButton>
        {nebenKnopf}
      </div>
    </form>
  );
}

/**
 * Knopf fuer Actions ohne Formular (gebunden mit .bind(null, id)). Zeigt den
 * Fehlertext direkt unter dem Knopf.
 */
export function AktionKnopf({
  aktion,
  children,
  pendingLabel = "Wird ausgeführt …",
  variant = "outline",
  size = "sm",
  className,
  bestaetigung,
}: {
  aktion: () => Promise<AktionsErgebnis>;
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  /** Wenn gesetzt: erster Klick zeigt diese Frage, zweiter Klick fuehrt aus. */
  bestaetigung?: string;
}) {
  const [pending, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [nachfrage, setNachfrage] = useState(false);

  const ausfuehren = () => {
    setFehler(null);
    start(async () => {
      const r = await aktion();
      setFehler(r.error ?? null);
      setNachfrage(false);
    });
  };

  if (bestaetigung && nachfrage) {
    return (
      <div className={cn("space-y-2", className)}>
        <p className="text-sm text-foreground">{bestaetigung}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size={size} variant={variant} disabled={pending} onClick={ausfuehren}>
            {pending ? pendingLabel : "Ja, ausführen"}
          </Button>
          <Button type="button" size={size} variant="ghost" disabled={pending} onClick={() => setNachfrage(false)}>
            Abbrechen
          </Button>
        </div>
        {fehler && <p className="text-sm text-destructive" role="alert">{fehler}</p>}
      </div>
    );
  }

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={pending}
        aria-busy={pending}
        onClick={() => (bestaetigung ? setNachfrage(true) : ausfuehren())}
      >
        {pending ? pendingLabel : children}
      </Button>
      {fehler && <p className="text-xs text-destructive" role="alert">{fehler}</p>}
    </div>
  );
}
