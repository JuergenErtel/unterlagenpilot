"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, Camera, CheckCircle2, AlertTriangle, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  brokerUploadOne,
  finishBrokerUpload,
  requestBrokerUploadSlot,
  processBrokerStoredUpload,
} from "@/lib/actions/upload";
import { uploadFilesSequentially, type UploadOutcome, type UploadProgress } from "@/lib/upload/client-upload";

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export interface BrokerUploadApplicant {
  position: number;
  name: string;
}

/**
 * Vermittler-Upload direkt im Fall-Cockpit: beliebige Dokumente selbst hochladen,
 * Antragsteller-Zuordnung wählbar. Dateien werden EINZELN nacheinander hochgeladen
 * (siehe client-upload), damit auch große Sammel-Uploads zuverlässig durchlaufen.
 * Nutzt dieselbe gesicherte Pipeline wie der Kunden-Upload.
 */
export function BrokerUploadForm({
  caseId,
  maxMb,
  applicants,
}: {
  caseId: string;
  maxMb: number;
  applicants: BrokerUploadApplicant[];
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<UploadOutcome | null>(null);
  const [applicantPosition, setApplicantPosition] = useState<string>(
    applicants.length > 0 ? String(applicants[0]!.position) : "none"
  );
  const hiddenInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hiddenInput.current) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    hiddenInput.current.files = dt.files;
  }, [files]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}`));
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}|${f.size}`))];
    });
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || files.length === 0) return;
    setBusy(true);
    setResult(null);
    setProgress({ done: 0, total: files.length });
    try {
      const outcome = await uploadFilesSequentially(
        files,
        (fd) => brokerUploadOne(caseId, fd),
        {
          extraFields: { applicantPosition },
          onProgress: setProgress,
          requestSlot: (name, mime) => requestBrokerUploadSlot(caseId, name, mime),
          processStored: (meta) => processBrokerStoredUpload(caseId, applicantPosition, meta),
        }
      );
      await finishBrokerUpload(caseId);
      setResult(outcome);
      if (outcome.uploaded > 0) setFiles([]);
    } catch {
      setResult({ uploaded: 0, rejected: [], error: "Upload fehlgeschlagen. Bitte erneut versuchen." });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input ref={hiddenInput} type="file" name="files" multiple className="hidden" tabIndex={-1} aria-hidden />

      {applicants.length > 0 ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Antragsteller zuordnen</span>
          <select
            name="applicantPosition"
            value={applicantPosition}
            onChange={(e) => setApplicantPosition(e.target.value)}
            disabled={busy}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {applicants.map((a) => (
              <option key={a.position} value={String(a.position)}>
                {a.name || `Antragsteller ${a.position}`}
              </option>
            ))}
            <option value="none">Nicht zuordnen</option>
          </select>
        </label>
      ) : null}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? "border-ai bg-ai/5" : "hover:border-ai/50"
        }`}
      >
        <label className="flex cursor-pointer flex-col items-center gap-2">
          <UploadCloud className="h-9 w-9 text-muted-foreground" />
          <span className="text-sm font-medium">Dateien auswählen oder hierher ziehen</span>
          <span className="text-xs text-muted-foreground">PDF, JPG oder PNG · max. {maxMb} MB pro Datei</span>
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="mt-1 rounded-md border px-3 py-1.5 text-xs font-medium">Dateien auswählen</span>
        </label>

        <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs text-primary underline sm:hidden">
          <Camera className="h-3.5 w-3.5" />
          Oder direkt mit der Kamera fotografieren
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {files.length > 0 ? (
        <ul className="space-y-1.5 rounded-md border p-3 text-sm">
          {files.map((f, i) => (
            <li key={`${f.name}|${f.size}`} className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatMb(f.size)}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={`${f.name} entfernen`}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
                disabled={busy}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {busy && progress ? (
        <div className="space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-ai transition-all"
              style={{ width: `${progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Lade {Math.min(progress.done + 1, progress.total)} von {progress.total} hoch … bitte Seite geöffnet lassen
          </p>
        </div>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={busy || files.length === 0}>
        {busy
          ? "Wird geprüft …"
          : files.length > 0
            ? `${files.length} Datei(en) hochladen`
            : "Hochladen"}
      </Button>

      {result?.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {result.error}
        </p>
      ) : null}

      {result && result.uploaded > 0 ? (
        <p className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {result.uploaded} Datei(en) hochgeladen und automatisch klassifiziert.
        </p>
      ) : null}

      {result && result.rejected.length > 0 ? (
        <div className="space-y-1.5 rounded-md bg-warning/10 px-3 py-2 text-sm" role="alert">
          <div className="flex items-center gap-2 font-medium text-warning-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Einige Dateien wurden nicht übernommen
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {result.rejected.map((r, i) => (
              <li key={i}>
                <span className="font-medium text-foreground">{r.name}</span>: {r.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
