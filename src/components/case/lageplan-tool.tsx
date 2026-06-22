"use client";

import { useActionState, useEffect, useState } from "react";
import { MapPin, FileDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateLageplanAction, saveLageplanPdfAction, type LageplanState } from "@/lib/actions/lageplan";
import { geoportalFor } from "@/lib/geo/geoportale";

const fb = geoportalFor(null).entry;

export function LageplanTool({ caseId, initialAddress }: { caseId: string; initialAddress: string }) {
  const action = generateLageplanAction.bind(null, caseId);
  const [state, formAction, pending] = useActionState<LageplanState, FormData>(action, {
    mapDataUri: null, lat: null, lon: null, bundesland: null, geoportalLabel: fb.label, geoportalUrl: fb.url, address: initialAddress,
  });
  const [docId, setDocId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDocId(null);
    setPdfError(null);
  }, [state.mapDataUri]);

  async function savePdf() {
    if (state.mapDataUri == null || state.lat == null || state.lon == null) return;
    setSaving(true);
    setPdfError(null);
    try {
      const res = await saveLageplanPdfAction(caseId, {
        address: state.address,
        lat: state.lat,
        lon: state.lon,
        bundesland: state.bundesland ?? "",
        geoportalLabel: state.geoportalLabel,
        geoportalUrl: state.geoportalUrl,
        mapBase64: state.mapDataUri.replace(/^data:image\/png;base64,/, ""),
      });
      if (res.documentId) setDocId(res.documentId);
      else if (res.error) setPdfError(res.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="rounded-lg border p-4">
        <label className="text-xs text-muted-foreground" htmlFor="address">Objektadresse</label>
        <div className="mt-1 flex gap-2">
          <Input id="address" name="address" defaultValue={initialAddress} placeholder="Straße Hausnr., PLZ Ort" className="h-10 flex-1" />
          <Button type="submit" disabled={pending}>
            <MapPin className="h-4 w-4" />{pending ? "Suche …" : "Lageplan erzeugen"}
          </Button>
        </div>
        {state.error ? <p className="mt-2 text-sm text-warning-foreground">{state.error}</p> : null}
      </form>

      {state.geoportalUrl ? (
        <div className="rounded-lg border bg-card p-4 text-sm">
          <div className="font-medium">Amtliche Flurkarte{state.bundesland ? ` (${state.bundesland})` : ""}</div>
          <a href={state.geoportalUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-ai underline">
            <ExternalLink className="h-3.5 w-3.5" />{state.geoportalLabel}
          </a>
          <p className="mt-1 text-xs text-muted-foreground">Dort den amtlichen Auszug abrufen.</p>
        </div>
      ) : null}

      {state.mapDataUri ? (
        <div className="space-y-3 rounded-lg border p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.mapDataUri} alt="Orientierungs-Lageplan" className="mx-auto max-w-full rounded border" />
          <p className="text-center text-xs text-muted-foreground">
            Koordinaten: {state.lat?.toFixed(5)}, {state.lon?.toFixed(5)} · Objekt in der Bildmitte
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={savePdf} variant="success" size="sm" disabled={saving}>
              <FileDown className="h-4 w-4" />{docId ? "Abgelegt" : saving ? "Erstelle …" : "Als PDF ablegen"}
            </Button>
            {docId ? (
              <Button asChild variant="outline" size="sm"><a href={`/api/documents/${docId}/download`}>PDF öffnen</a></Button>
            ) : null}
          </div>
          {pdfError ? <p className="text-center text-sm text-destructive">{pdfError}</p> : null}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Orientierungs-Lageplan – kein amtlicher Auszug; amtliche Flurkarte über das Landes-Geoportal. Kartenquellen: © BKG (TopPlusOpen), © OpenStreetMap-Mitwirkende.
      </p>
    </div>
  );
}
