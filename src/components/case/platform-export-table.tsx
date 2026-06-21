"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/case/confidence-badge";
import { CopyButton } from "@/components/ui/copy-button";

export interface ExportFieldRow {
  platformField: string;
  internalField: string;
  label: string;
  value: string | number | boolean | null;
  confidence: number;
  requiresReview: boolean;
}

export interface ExportGroup {
  group: string;
  fields: ExportFieldRow[];
}

function fmt(v: ExportFieldRow["value"]): string {
  return v === null || v === "" ? "—" : String(v);
}

/**
 * Interaktive Plattform-Feldtabelle für die MANUELLE Übergabe (Kopiermaske).
 * - Copy je Feld und je Abschnitt.
 * - „geprüft"-Haken als lokaler Fortschrittsmerker (localStorage) – hilft beim
 *   Abtippen in die Plattform. Keine automatische Übertragung.
 */
export function PlatformExportTable({
  groups,
  caseId,
  platform,
}: {
  groups: ExportGroup[];
  caseId: string;
  platform: string;
}) {
  const storageKey = `up:checked:${caseId}:${platform}`;
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setChecked(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  function toggle(field: string) {
    setChecked((prev) => {
      const next = { ...prev, [field]: !prev[field] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const sectionText = g.fields.map((f) => `${f.label}: ${fmt(f.value)}`).join("\n");
        return (
          <div key={g.group} className="overflow-hidden rounded-lg border">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
              <span className="text-sm font-semibold">{g.group}</span>
              <CopyButton value={sectionText} label="Abschnitt kopieren" />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Plattformfeld</th>
                  <th className="px-3 py-2 font-medium">Interner Feldname</th>
                  <th className="px-3 py-2 font-medium">Wert</th>
                  <th className="px-3 py-2 font-medium">Konfidenz</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-center font-medium">Geprüft</th>
                  <th className="px-3 py-2 text-right font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {g.fields.map((f) => {
                  const empty = f.value === null || f.value === "";
                  const isChecked = !!checked[f.platformField];
                  return (
                    <tr key={f.platformField} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{f.label}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{f.platformField}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{f.internalField}</td>
                      <td className="px-3 py-2 font-mono tabular">
                        {empty ? <span className="text-muted-foreground">—</span> : String(f.value)}
                      </td>
                      <td className="px-3 py-2">
                        <ConfidenceBadge value={f.confidence} />
                      </td>
                      <td className="px-3 py-2">
                        {empty ? (
                          <Badge variant="destructive">fehlt</Badge>
                        ) : f.requiresReview && !isChecked ? (
                          <Badge variant="warning">prüfen</Badge>
                        ) : (
                          <Badge variant="success">übernommen</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(f.platformField)}
                          aria-label="Als geprüft markieren"
                          className={`mx-auto flex h-5 w-5 items-center justify-center rounded border ${
                            isChecked ? "border-success bg-success text-success-foreground" : "border-input"
                          }`}
                        >
                          {isChecked ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <CopyButton value={empty ? "" : String(f.value)} size="icon" label="Wert kopieren" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
