"use client";

import { useActionState, useEffect, useState } from "react";
import { UploadCloud, Save, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KENNZAHL_LABELS, trendFor, type ConsolidatedMatrix } from "@/lib/einkommen/consolidate";
import {
  analyzeSelfEmployedAction,
  createEinkommensPdfAction,
  type EinkommenState,
} from "@/lib/actions/einkommen";

const TREND_LABEL: Record<string, string> = {
  steigend: "↑ steigend",
  fallend: "↓ fallend",
  stabil: "→ stabil",
  unbekannt: "—",
};

interface EditRow {
  kennzahl: string;
  label: string;
  cells: Record<number, number | null>;
}

export function EinkommenEditor({ caseId }: { caseId: string }) {
  const action = analyzeSelfEmployedAction.bind(null, caseId);
  const [state, formAction, pending] = useActionState<EinkommenState, FormData>(action, {
    matrix: null,
    docNotes: [],
  });

  const [jahre, setJahre] = useState<number[]>([]);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [notes, setNotes] = useState<Array<{ label: string; notiz: string }>>([]);
  const [ansatz, setAnsatz] = useState<string>("");
  const [docId, setDocId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

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
  }, [state.matrix, state.docNotes]);

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

  async function createPdf() {
    const ansatzJahr = ansatz.trim() === "" ? null : Number(ansatz);
    setPdfError(null);
    const res = await createEinkommensPdfAction(caseId, {
      jahre,
      rows: rows.map((r) => {
        const vals = jahre
          .map((j) => r.cells[j])
          .filter((v): v is number => typeof v === "number");
        return { kennzahl: r.kennzahl, label: r.label, cells: r.cells, trend: trendFor(vals) };
      }),
      docNotes: notes,
      einkommensansatzJahr: ansatzJahr,
    });
    if (res.documentId) {
      setDocId(res.documentId);
    } else if (res.error) {
      setPdfError(res.error);
    }
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="rounded-lg border p-4">
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
          />
        </label>
        <Button type="submit" className="mt-3 w-full" disabled={pending}>
          {pending ? "Analysiere …" : "Analysieren"}
        </Button>
        {state.error ? <p className="mt-2 text-sm text-destructive">{state.error}</p> : null}
      </form>

      {rows.length > 0 && (
        <>
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
                Einkommensansatz (€/Jahr) – manuell
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
                <Button onClick={createPdf} variant="success" size="sm">
                  <Save className="h-4 w-4" />
                  {docId ? "PDF erstellt" : "PDF erstellen & ablegen"}
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
