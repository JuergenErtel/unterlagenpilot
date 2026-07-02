"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Ban } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { reviewExtractedField } from "@/lib/actions/review";

/**
 * ✓/✎/∅-Aktionen für ein erkanntes Feld im Review-Center.
 * Akzeptieren und Ignorieren wirken sofort; Korrigieren öffnet ein Inline-Feld.
 */
export function ExtractedFieldActions({
  fieldId,
  currentValue,
  reviewed,
}: {
  fieldId: string;
  currentValue: string | null;
  reviewed: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentValue ?? "");
  const [pending, startTransition] = useTransition();

  function run(mode: "akzeptieren" | "korrigieren" | "ignorieren", value?: string) {
    startTransition(async () => {
      await reviewExtractedField(fieldId, mode, value);
      setEditing(false);
    });
  }

  if (reviewed && !editing) {
    return (
      <span className="rounded bg-success/15 px-1.5 py-0.5 text-[11px] text-success-foreground">
        geprüft
      </span>
    );
  }

  if (editing) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) run("korrigieren", draft);
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="h-7 w-28 text-xs"
          aria-label="Korrigierter Wert"
          disabled={pending}
        />
        <Button type="submit" size="sm" variant="success" className="h-7 px-2 text-[11px]" disabled={pending || !draft.trim()}>
          Speichern
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={() => setEditing(false)}
          disabled={pending}
        >
          Abbrechen
        </Button>
      </form>
    );
  }

  return (
    <div className="flex gap-0.5">
      <button
        type="button"
        onClick={() => run("akzeptieren")}
        disabled={pending}
        aria-label="Wert akzeptieren"
        title="Akzeptieren"
        className="rounded p-1 text-success hover:bg-success/10 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={pending}
        aria-label="Wert korrigieren"
        title="Korrigieren"
        className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => run("ignorieren")}
        disabled={pending}
        aria-label="Wert ignorieren"
        title="Ignorieren (Feld leeren)"
        className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        <Ban className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
