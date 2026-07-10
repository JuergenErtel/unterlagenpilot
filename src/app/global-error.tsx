"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Globale Fehler-Boundary: fängt React-Render-Fehler im Root-Layout ab, die eine
 * normale error.tsx nicht mehr erreicht. Meldet sie an Sentry und zeigt eine
 * laienverständliche Ausweichseite. Ersetzt das komplette <html>-Dokument, muss
 * daher eigene <html>/<body>-Tags mitbringen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center", border: "1px solid #e5e7eb", borderRadius: 12, padding: 32 }}>
            <div style={{ margin: "0 auto 12px", width: 48, height: 48, display: "grid", placeItems: "center", borderRadius: 999, background: "#fef2f2" }}>
              <AlertTriangle style={{ width: 24, height: 24, color: "#dc2626" }} />
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 600 }}>Die Seite ist gerade nicht erreichbar</h1>
            <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280" }}>
              Bitte versuchen Sie es in einem Moment erneut. Es sind keine Daten verloren gegangen.
            </p>
            {error.digest ? (
              <p style={{ marginTop: 8, fontFamily: "monospace", fontSize: 11, color: "#9ca3af" }}>
                Fehlercode: {error.digest}
              </p>
            ) : null}
            <button
              onClick={reset}
              style={{ marginTop: 20, display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 8, border: "none", background: "#1f3a8a", color: "#fff", padding: "8px 16px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            >
              <RotateCw style={{ width: 16, height: 16 }} /> Erneut versuchen
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
