"use client";

import { useActionState, useState } from "react";
import { Link2, Copy, Check, RefreshCw, Ban, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createUploadLinkAction,
  regenerateUploadLinkAction,
  deactivateUploadLinkAction,
  type UploadLinkActionState,
} from "@/lib/actions/cases";

export interface UploadLinkRow {
  id: string;
  expiresAt: string;
  active: boolean;
  expired: boolean;
  maxUploads: number | null;
  usedCount: number;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Kopiert" : "Kopieren"}
    </button>
  );
}

export function UploadLinkManager({ caseId, links }: { caseId: string; links: UploadLinkRow[] }) {
  const createAction = createUploadLinkAction.bind(null, caseId);
  const regenAction = regenerateUploadLinkAction.bind(null, caseId);
  const [createState, createFn, creating] = useActionState<UploadLinkActionState, FormData>(createAction, {});
  const [regenState, regenFn, regenerating] = useActionState<UploadLinkActionState, FormData>(regenAction, {});

  const freshUrl = createState.url || regenState.url;
  const error = createState.error || regenState.error;
  const activeLinks = links.filter((l) => l.active && !l.expired);

  return (
    <div className="space-y-3">
      {freshUrl ? (
        <div className="space-y-2 rounded-md border border-ai/30 bg-ai/[0.04] p-3">
          <p className="text-xs font-medium text-ai">
            Neuer Link erstellt – jetzt kopieren (wird aus Sicherheitsgründen nicht erneut angezeigt):
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 text-[11px]">{freshUrl}</code>
            <CopyButton value={freshUrl} />
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <form action={createFn}>
          <input type="hidden" name="days" value="14" />
          <Button type="submit" variant="outline" size="sm" disabled={creating}>
            <Link2 className="h-3.5 w-3.5" /> {creating ? "Erstelle …" : "Upload-Link erstellen"}
          </Button>
        </form>
        {activeLinks.length > 0 ? (
          <form action={regenFn}>
            <input type="hidden" name="days" value="14" />
            <Button type="submit" variant="ghost" size="sm" disabled={regenerating}>
              <RefreshCw className="h-3.5 w-3.5" /> Neu erzeugen
            </Button>
          </form>
        ) : null}
      </div>

      {links.length > 0 ? (
        <ul className="space-y-1.5">
          {links.slice(0, 5).map((l) => {
            const status = !l.active ? "deaktiviert" : l.expired ? "abgelaufen" : "aktiv";
            return (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant={status === "aktiv" ? "success" : "neutral"}>{status}</Badge>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    bis {new Date(l.expiresAt).toLocaleDateString("de-DE")}
                  </span>
                  <span className="text-muted-foreground">
                    {l.usedCount} Upload(s){l.maxUploads != null ? ` / max. ${l.maxUploads}` : ""}
                  </span>
                </div>
                {l.active && !l.expired ? (
                  <form action={deactivateUploadLinkAction.bind(null, caseId, l.id)}>
                    <button type="submit" className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive">
                      <Ban className="h-3 w-3" /> deaktivieren
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Noch kein Upload-Link. Erstellen Sie einen sicheren Link, damit der Kunde Unterlagen hochladen kann.
        </p>
      )}
    </div>
  );
}
