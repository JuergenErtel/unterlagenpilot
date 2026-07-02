"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Fehler-Boundary für öffentliche Routen (z.B. Kunden-Upload, Login).
 * Fängt Server-Render-Fehler ab und zeigt eine laienverständliche Meldung
 * statt des generischen "Application error"-Screens.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[public] Seitenfehler:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-md rounded-lg border bg-card p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-lg font-semibold">Die Seite ist gerade nicht erreichbar</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Bitte versuchen Sie es in einem Moment erneut. Es sind keine Daten verloren gegangen.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground/70">Fehlercode: {error.digest}</p>
        ) : null}
        <button
          onClick={reset}
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <RotateCw className="h-4 w-4" /> Erneut versuchen
        </button>
      </div>
    </div>
  );
}
