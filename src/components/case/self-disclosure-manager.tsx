"use client";

import { useState, useTransition } from "react";
import { ClipboardList, Copy, Check, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  erstelleSelbstauskunftLink,
  widerrufeSelbstauskunftLink,
} from "@/lib/actions/self-disclosure";

/**
 * Link-Verwaltung für die Selbstauskunft – bewusst so aufgebaut wie die
 * Upload-Link-Verwaltung daneben, damit sich beides gleich anfühlt.
 */
export function SelfDisclosureManager({
  caseId,
  status,
  aktiverLinkId,
}: {
  caseId: string;
  /** Fertig formulierter Stand, z. B. „begonnen, Schritt 7 von 36". */
  status: string;
  aktiverLinkId: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div id="selbstauskunft" className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Selbstauskunft</h3>
        <Badge variant="outline">{status}</Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Der Kunde beantwortet Fragen zu Vorhaben, Person, Einkommen und Verpflichtungen. Nichts
        davon wandert ohne deine Freigabe in den Fall.
      </p>

      {url && (
        <div className="flex items-center gap-2 rounded-md bg-muted p-2">
          <code className="flex-1 truncate text-xs">{url}</code>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs"
            onClick={() => {
              navigator.clipboard?.writeText(url);
              setKopiert(true);
              setTimeout(() => setKopiert(false), 1500);
            }}
          >
            {kopiert ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {kopiert ? "Kopiert" : "Kopieren"}
          </button>
        </div>
      )}
      {url && (
        <p className="text-xs text-muted-foreground">
          Diesen Link jetzt kopieren – er ist später nicht mehr abrufbar.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await erstelleSelbstauskunftLink(caseId);
              setUrl(res.url ?? null);
            })
          }
        >
          {aktiverLinkId ? "Neuen Link erstellen" : "Link erstellen"}
        </Button>
        {aktiverLinkId && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await widerrufeSelbstauskunftLink(caseId, aktiverLinkId);
                setUrl(null);
              })
            }
          >
            <Ban className="mr-1 h-3 w-3" />
            Widerrufen
          </Button>
        )}
      </div>
    </div>
  );
}
