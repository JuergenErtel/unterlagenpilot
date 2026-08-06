"use client";

import { useState, useTransition } from "react";
import { assignDocumentApplicant } from "@/lib/actions/review";

export interface ApplicantOption {
  id: string;
  /** Anzeigename, z. B. "Max Mustermann" oder "Antragsteller 2". */
  name: string;
}

/**
 * Ordnet ein Dokument einem Antragsteller zu.
 *
 * Nur sinnvoll (und nur sichtbar) bei mehr als einem Antragsteller: Kunden-Uploads
 * kommen dann bewusst ohne Zuordnung an, weil der gemeinsame Upload-Link nicht
 * verrät, wer die Datei hochgeladen hat. Ohne diese Zuordnung bleibt die
 * Checkliste je Person unvollständig.
 */
export function ApplicantSelect({
  documentId,
  value,
  applicants,
  source,
  className,
}: {
  documentId: string;
  value: string | null;
  applicants: ApplicantOption[];
  /** Herkunft der Zuordnung: "auto" zeigt einen Hinweis an. */
  source?: string | null;
  className?: string;
}) {
  const [current, setCurrent] = useState<string>(value ?? "");
  const [touched, setTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    setCurrent(next);
    setTouched(true);
    startTransition(async () => {
      await assignDocumentApplicant(documentId, next || null);
    });
  }

  // Nach eigener Auswahl ist die Zuordnung nicht mehr automatisch – der Hinweis
  // verschwindet sofort, ohne auf das Neuladen der Seite zu warten.
  const zeigeAutoHinweis = source === "auto" && !touched && current !== "";

  return (
    <div className="space-y-1">
      <select
        aria-label="Antragsteller"
        value={current}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ??
          "h-8 max-w-[16rem] rounded-md border bg-background px-2 text-sm disabled:opacity-60"
        }
      >
        <option value="">– noch nicht zugeordnet –</option>
        {applicants.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {zeigeAutoHinweis && (
        <p className="text-xs text-muted-foreground">automatisch zugeordnet</p>
      )}
    </div>
  );
}
