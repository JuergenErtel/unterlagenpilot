"use client";

import { useEffect, useState } from "react";
import { UploadCloud, Save, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KENNZAHL_LABELS, trendFor } from "@/lib/einkommen/consolidate";
import { suggestEinkommensansatz } from "@/lib/einkommen/ansatz";
import {
  einkommenUploadOne,
  requestEinkommenUploadSlot,
  processEinkommenStoredUpload,
  analyzeStoredSelfEmployedDocs,
  createSelfEmployedBankSummaryAction,
  type EinkommenState,
} from "@/lib/actions/einkommen";

const TREND_LABEL: Record<string, string> = {
  steigend: "↑ steigend",
  fallend: "↓ fallend",
  stabil: "→ stabil",
  unbekannt: "—",
};

const DIRECT_ABOVE = 3_500_000;

interface EditRow {
  kennzahl: string;
  label: string;
  cells: Record<number, number | null>;
}

export function EinkommenEditor({
  caseId,
  applicants,
  selfEmployment,
}: {
  caseId: string;
  applicants: Array<{ position: number; name: string }>;
  selfEmployment: { position: number; firma: string; rechtsform: string; gruendungsjahr: number | null } | null;
}) {
  const [applicantPosition, setApplicantPosition] = useState<number>(applicants[0]?.position ?? 1);
  const [firma, setFirma] = useState(selfEmployment?.firma ?? "");
  const [rechtsform, setRechtsform] = useState(selfEmployment?.rechtsform ?? "");
  const [gruendungsjahr, setGruendungsjahr] = useState(
    selfEmployment?.gruendungsjahr ? String(selfEmployment.gruendungsjahr) : ""
  );

  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [state, setState] = useState<EinkommenState>({ matrix: null, docNotes: [] });

  const [jahre, setJahre] = useState<number[]>([]);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [notes, setNotes] = useState<Array<{ label: string; notiz: string }>>([]);
  const [ansatz, setAnsatz] = useState<string>("");
  const [docId, setDocId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!state.matrix) return;
    setJahre(state.matrix.jahre);
    setRows(
      state.matrix.rows.map((r) => ({
        kennzahl: r.kennzahl,
        label: KENNZAHL_LABELS[r.kennzahl as keyof typeof KENNZAHL_LABELS] ?? r.kennzahl,
        cells: Object.fromEntries(
          Object.entries(r.cells).map(([j, c]) => [Number(j), c.value])
        ) as Record<number, number | null>,
      }))
    );
    setNotes(state.docNotes);
    setDocId(null);
    setPdfError(null);
    if (ansatz.trim() === "" && state.matrix) {
      const s = suggestEinkommensansatz(state.matrix);
      if (s != null) setAnsatz(String(s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.matrix, state.docNotes]);

  async function analyze(filesToAnalyze: File[]) {
    setBusy(true);
    setUploadError(null);
    const ids: string[] = [];
    const failed: string[] = [];
    for (const f of filesToAnalyze) {
      try {
        let r: { documentId?: string; error?: string };
        if (f.size > DIRECT_ABOVE) {
          const slot = await requestEinkommenUploadSlot(caseId, f.name, f.type || "application/octet-stream");
          if ("error" in slot) {
            failed.push(f.name);
            continue;
          }
          const form = new FormData();
          form.append("cacheControl", "3600");
          form.append("", f, f.name);
          const put = await fetch(slot.uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
          if (!put.ok) {
            failed.push(f.name);
            continue;
          }
          r = await processEinkommenStoredUpload(caseId, {
            storageKey: slot.storageKey,
            originalName: f.name,
            mimeType: f.type || "application/octet-stream",
            sizeBytes: f.size,
          });
        } else {
          const fd = new FormData();
          fd.append("files", f);
          r = await einkommenUploadOne(caseId, fd);
        }
        if (r.documentId) ids.push(r.documentId);
        else failed.push(f.name);
      } catch {
        failed.push(f.name);
      }
    }
    if (ids.length === 0) {
      setBusy(false);
      setUploadError("Keine Datei konnte hochgeladen werden.");
      return;
    }
    const res = await analyzeStoredSelfEmployedDocs(caseId, ids);
    setState(res);
    if (failed.length) setUploadError(`${failed.length} Datei(en) nicht verarbeitet: ${failed.join(", ")}`);
    setBusy(false);
  }

  function updateCell(rowIdx: number, jahr: number, value: string) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === rowIdx
          ? { ...r, cells: { ...r.cells, [jahr]: value === "" ? null : Number(value) } }
          : r
      )
    );
    setDocId(null);
    setPdfError(null);
  }

  async function createSummary() {
    setCreating(true);
    setPdfError(null);
    try {
      const res = await createSelfEmployedBankSummaryAction(caseId, {
        applicantPosition,
        selfEmployment: {
          firma: firma.trim(),
          rechtsform: rechtsform.trim(),
          gruendungsjahr: gruendungsjahr.trim() ? Number(gruendungsjahr) : null,
        },
        jahre,
        rows: rows.map((r) => {
          const vals = jahre.map((j) => r.cells[j]).filter((v): v is number => typeof v === "number");
          return { kennzahl: r.kennzahl, label: r.label, cells: r.cells, trend: trendFor(vals) };
        }),
        docNotes: notes,
        einkommensansatzJahr: ansatz.trim() === "" ? null : Number(ansatz),
      });
      if (res.documentId) setDocId(res.documentId);
      else if (res.error) setPdfError(res.error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border p-4">
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center hover:border-ai/50">
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-medium">
            Unterlagen hochladen – BWA, G+V, Jahresabschluss, EÜR, Steuerbescheid (JPG/PNG/PDF,
            mehrjährig)
          </span>
          <input
            type="file"
            name="files"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            className="mt-2 text-xs"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        <Button
          type="button"
          className="mt-3 w-full"
          disabled={busy || files.length === 0}
          onClick={() => analyze(files)}
        >
          {busy ? "Analysiere …" : "Analysieren"}
        </Button>
        {state.error ? <p className="mt-2 text-sm text-destructive">{state.error}</p> : null}
        {uploadError ? <p className="mt-2 text-sm text-destructive">{uploadError}</p> : null}
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-4">
            {applicants.length > 1 && (
              <label className="text-xs text-muted-foreground">
                Antragsteller
                <select
                  value={applicantPosition}
                  onChange={(e) => setApplicantPosition(Number(e.target.value))}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {applicants.map((a) => (
                    <option key={a.position} value={a.position}>
                      {a.name || `Antragsteller ${a.position}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs text-muted-foreground">
              Firma
              <Input value={firma} onChange={(e) => setFirma(e.target.value)} className="mt-1 h-9" />
            </label>
            <label className="text-xs text-muted-foreground">
              Rechtsform
              <Input
                value={rechtsform}
                onChange={(e) => setRechtsform(e.target.value)}
                className="mt-1 h-9"
                placeholder="z. B. Einzelunternehmen, GmbH"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Selbstständig seit (Jahr)
              <Input
                type="number"
                value={gruendungsjahr}
                onChange={(e) => setGruendungsjahr(e.target.value)}
                className="mt-1 h-9"
                placeholder="z. B. 2019"
              />
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Kennzahl</th>
                  {jahre.map((j) => (
                    <th key={j} className="px-3 py-2">
                      {j}
                    </th>
                  ))}
                  <th className="px-3 py-2">Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const vals = jahre
                    .map((j) => r.cells[j])
                    .filter((v): v is number => typeof v === "number");
                  return (
                    <tr key={r.kennzahl} className="border-b last:border-0">
                      <td className="px-3 py-1 font-medium">{r.label}</td>
                      {jahre.map((j) => (
                        <td key={j} className="px-3 py-1">
                          <Input
                            type="number"
                            value={r.cells[j] ?? ""}
                            onChange={(e) => updateCell(i, j, e.target.value)}
                            className="h-8 w-28"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-1 text-xs text-muted-foreground">
                        {TREND_LABEL[trendFor(vals)] ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="ansatz">
                Einkommensansatz (€/Jahr) – Vorschlag, überschreibbar
              </label>
              <Input
                id="ansatz"
                type="number"
                value={ansatz}
                onChange={(e) => {
                  setAnsatz(e.target.value);
                  setDocId(null);
                  setPdfError(null);
                }}
                className="mt-1 h-9 w-44"
                placeholder="z. B. 80000"
              />
              {ansatz.trim() !== "" && !Number.isNaN(Number(ansatz)) ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  ≈ {Math.round(Number(ansatz) / 12).toLocaleString("de-DE")} € / Monat
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex gap-2">
                <Button onClick={createSummary} variant="success" size="sm" disabled={creating}>
                  <Save className="h-4 w-4" />
                  {creating ? "Erstelle …" : docId ? "Bankzusammenfassung erstellt" : "Bankzusammenfassung erstellen"}
                </Button>
                {docId ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/documents/${docId}/download`}>
                      <FileDown className="h-4 w-4" />
                      PDF öffnen
                    </a>
                  </Button>
                ) : null}
              </div>
              {pdfError ? (
                <p className="text-xs text-destructive">{pdfError}</p>
              ) : null}
            </div>
          </div>

          {notes.length > 0 && (
            <div className="space-y-2 rounded-lg border p-4">
              <div className="text-sm font-medium">Einordnung je Dokument</div>
              {notes.map((n, i) => (
                <div key={i} className="text-xs">
                  <span className="font-medium text-foreground">{n.label}: </span>
                  <span className="text-muted-foreground">{n.notiz}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Analyse auf Basis der vorgelegten Unterlagen – keine Bonitäts- oder
            Einkommensbestätigung. Die finale Beurteilung trifft die Bank. Bitte Werte prüfen.
          </p>
        </>
      )}
    </div>
  );
}
