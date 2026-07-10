"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

export interface SubmitButtonProps extends Omit<ButtonProps, "type" | "asChild"> {
  /** Beschriftung während der laufenden Aktion. Default: "Wird ausgeführt …" */
  pendingLabel?: string;
}

/**
 * Absende-Button für Server-Action-Formulare mit sichtbarem Lauf-Zustand.
 *
 * Nackte `<Button type="submit">` in `<form action={serverAction}>` geben dem
 * Nutzer keinerlei Rückmeldung: Nach dem Klick passiert sichtbar nichts, und ein
 * zweiter Klick löst die Aktion erneut aus. `useFormStatus` sperrt den Button für
 * die Dauer der Aktion und zeigt einen Spinner.
 */
export function SubmitButton({
  children,
  pendingLabel = "Wird ausgeführt …",
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
