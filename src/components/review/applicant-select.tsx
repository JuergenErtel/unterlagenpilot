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
  className,
}: {
  documentId: string;
  value: string | null;
  applicants: ApplicantOption[];
  className?: string;
}) {
  const [current, setCurrent] = useState<string>(value ?? "");
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    setCurrent(next);
    startTransition(async () => {
      await assignDocumentApplicant(documentId, next || null);
    });
  }

  return (
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
  );
}
