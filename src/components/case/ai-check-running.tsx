"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Laufanzeige für die im Hintergrund laufende KI-Prüfung. Ersetzt den
 * Start-Button, solange der Fall in `ki_pruefung_laeuft` steht, und lädt die
 * Server-Daten regelmäßig nach, bis der Hintergrundlauf den Status weiterdreht.
 */
export function AiCheckRunning({ done, total }: { done: number; total: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
      <span aria-live="polite">
        KI-Prüfung läuft im Hintergrund
        {total > 0 ? ` – ${done} von ${total} Dokumenten geprüft` : ""}. Die Seite aktualisiert
        sich automatisch; Sie können währenddessen weiterarbeiten.
      </span>
    </div>
  );
}
