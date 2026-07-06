"use client";

import { useState, useTransition } from "react";
import { reclassifyDocument } from "@/lib/actions/review";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/domain/enums";

/**
 * Editierbares Dokumenttyp-Feld: korrigiert eine KI-Fehlsortierung per Hand.
 * Änderung submittet sofort (reclassifyDocument) – Typ + Dateiname werden neu gesetzt,
 * ohne KI-Aufruf. Für eine Neu-Extraktion danach "KI-Prüfung starten" nutzen.
 */
export function DocumentTypeSelect({
  documentId,
  value,
  className,
}: {
  documentId: string;
  value: DocumentType | null;
  className?: string;
}) {
  const [current, setCurrent] = useState<string>(value ?? "sonstige");
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    setCurrent(next);
    startTransition(async () => {
      await reclassifyDocument(documentId, next as DocumentType);
    });
  }

  return (
    <select
      aria-label="Dokumenttyp"
      value={current}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        "h-8 max-w-[16rem] rounded-md border bg-background px-2 text-sm disabled:opacity-60"
      }
    >
      {DOCUMENT_TYPES.map((t) => (
        <option key={t} value={t}>
          {DOCUMENT_TYPE_LABELS[t]}
        </option>
      ))}
    </select>
  );
}
