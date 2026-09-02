"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AUFTRAGSARTEN, LEISTUNGSBAUSTEINE, auftragsart } from "@/lib/backoffice/leistungen";

/**
 * Auftragsart als Radiogruppe, Leistungsbausteine als Checkboxen. Die Wahl
 * der Art belegt die Bausteine vor; danach darf der Nutzer jede Zeile
 * einzeln an- oder abwaehlen. Formularfelder: auftragsart, leistungen[].
 */
export function AuftragsartAuswahl({ start = "basis_pruefung" }: { start?: string }) {
  const [art, setArt] = useState(start);
  const [leistungen, setLeistungen] = useState<Set<string>>(new Set(auftragsart(start)?.leistungen ?? []));

  const artWaehlen = (key: string) => {
    setArt(key);
    setLeistungen(new Set(auftragsart(key)?.leistungen ?? []));
  };
  const toggle = (key: string) =>
    setLeistungen((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Auftragsart</legend>
        {AUFTRAGSARTEN.map((a) => (
          <label
            key={a.key}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors",
              art === a.key ? "border-primary bg-accent" : "hover:bg-accent/60"
            )}
          >
            <input type="radio" name="auftragsart" value={a.key} checked={art === a.key} onChange={() => artWaehlen(a.key)} className="mt-1" />
            <span>
              <span className="font-medium text-foreground">{a.label}</span>
              <span className="block text-xs text-muted-foreground">{a.beschreibung}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Leistungsumfang</legend>
        {LEISTUNGSBAUSTEINE.map((l) => (
          <label key={l.key} className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent/60">
            <input type="checkbox" name="leistungen" value={l.key} checked={leistungen.has(l.key)} onChange={() => toggle(l.key)} className="mt-1" />
            <span>
              <span className="font-medium text-foreground">{l.label}</span>
              <span className="block text-xs text-muted-foreground">{l.beschreibung}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
