"use client";

import { useActionState } from "react";
import { UploadCloud, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerUpload, type CustomerUploadState } from "@/lib/actions/upload";

export function CustomerUploadForm({ token, maxMb }: { token: string; maxMb: number }) {
  const action = customerUpload.bind(null, token);
  const [state, formAction, pending] = useActionState<CustomerUploadState, FormData>(action, {
    uploaded: 0,
    rejected: [],
  });

  return (
    <form action={formAction} className="space-y-4">
      <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-ai/50">
        <UploadCloud className="h-9 w-9 text-muted-foreground" />
        <span className="text-sm font-medium">Dateien auswählen oder hierher ziehen</span>
        <span className="text-xs text-muted-foreground">PDF, JPG oder PNG · max. {maxMb} MB pro Datei</span>
        <input type="file" name="files" multiple accept=".pdf,.jpg,.jpeg,.png" className="mt-2 w-full max-w-full text-xs" />
      </label>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Wird geprüft …" : "Hochladen"}
      </Button>

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
        <div className="space-y-1.5 rounded-md bg-warning/10 px-3 py-2 text-sm">
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
