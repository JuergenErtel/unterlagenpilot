"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Hinweis + Auto-Refresh, solange nach einem Upload noch OCR/Klassifikation/
 * Extraktion im Hintergrund laufen. Ohne das Polling erschiene der erkannte
 * Dokumenttyp erst nach manuellem Neuladen der Seite.
 */
export function DocumentsProcessing({ count }: { count: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
      <span aria-live="polite">
        {count === 1 ? "1 Dokument wird" : `${count} Dokumente werden`} noch verarbeitet (Texterkennung
        und Zuordnung). Die Tabelle aktualisiert sich automatisch.
      </span>
    </div>
  );
}
