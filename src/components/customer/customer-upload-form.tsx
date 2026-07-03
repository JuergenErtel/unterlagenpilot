"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { UploadCloud, Camera, CheckCircle2, AlertTriangle, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerUpload, type CustomerUploadState } from "@/lib/actions/upload";

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function CustomerUploadForm({ token, maxMb }: { token: string; maxMb: number }) {
  const action = customerUpload.bind(null, token);
  const [state, formAction, pending] = useActionState<CustomerUploadState, FormData>(action, {
    uploaded: 0,
    rejected: [],
  });

  // Ausgewählte Dateien leben im React-State; ein verstecktes Input trägt sie
  // ins FormData. So funktionieren Auswahl-Dialog, Kamera UND Drag&Drop zusammen.
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const hiddenInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hiddenInput.current) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    hiddenInput.current.files = dt.files;
  }, [files]);

  // Nach erfolgreichem Upload die Auswahl leeren.
  useEffect(() => {
    if (state.uploaded > 0) setFiles([]);
  }, [state]);

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

  return (
    <form action={formAction} className="space-y-4">
      <input ref={hiddenInput} type="file" name="files" multiple className="hidden" tabIndex={-1} aria-hidden />

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
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="mt-1 rounded-md border px-3 py-1.5 text-xs font-medium">Dateien auswählen</span>
        </label>

        {/* Direkter Kamera-Flow (Handy): liefert JPEG statt HEIC aus der Mediathek. */}
        <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs text-primary underline sm:hidden">
          <Camera className="h-3.5 w-3.5" />
          Oder direkt mit der Kamera fotografieren
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
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
                disabled={pending}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending || files.length === 0}>
        {pending
          ? "Wird geprüft … bitte Seite geöffnet lassen"
          : files.length > 0
            ? `${files.length} Datei(en) hochladen`
            : "Hochladen"}
      </Button>
      {pending ? (
        <p className="text-center text-xs text-muted-foreground">
          Ihre Dateien werden übertragen und automatisch geprüft – das kann bei Fotos einen Moment dauern.
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      {state.uploaded > 0 ? (
        <p className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {state.uploaded} Datei(en) erfolgreich hochgeladen und in Prüfung.
        </p>
      ) : null}

      {state.rejected.length > 0 ? (
        <div className="space-y-1.5 rounded-md bg-warning/10 px-3 py-2 text-sm" role="alert">
          <div className="flex items-center gap-2 font-medium text-warning-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Einige Dateien wurden nicht übernommen
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {state.rejected.map((r, i) => (
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
