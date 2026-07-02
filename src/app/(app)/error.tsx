"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Fehler-Boundary für App-Seiten: verständliche Meldung + Wiederholen statt Next-Default. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] Seitenfehler:", error);
  }, [error]);

  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <h1 className="text-lg font-semibold">Etwas ist schiefgelaufen</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Diese Seite konnte nicht geladen werden. Bitte versuchen Sie es erneut. Falls das Problem bestehen bleibt,
        laden Sie die Seite neu oder kehren Sie zum Dashboard zurück.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground/70">Fehlercode: {error.digest}</p>
      ) : null}
      <div className="mt-5 flex justify-center gap-2">
        <Button onClick={reset} size="sm">
          <RotateCw className="h-4 w-4" /> Erneut versuchen
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">Zum Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
