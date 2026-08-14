import * as Sentry from "@sentry/nextjs";
import { isReactStreamingCascade } from "@/lib/observability/react-streaming-noise";
import { mitDomFingerabdruck } from "@/lib/observability/hydration-diagnose";

/**
 * Sentry – clientseitige Fehlererfassung (Browser).
 *
 * Bewusst OHNE Session-Replay: die App verarbeitet personenbezogene Finanzdaten
 * (Namen, Einkommen, Dokumente). Ein Replay würde Bildschirminhalte aufzeichnen –
 * DSGVO-kritisch. Es werden nur Fehler mit technischem Kontext gemeldet.
 *
 * Der Versand läuft über den Tunnel (/monitoring, siehe next.config.mjs), damit
 * die strenge Content-Security-Policy (connect-src 'self') den Report nicht
 * blockiert und Ad-/Tracking-Blocker ihn nicht verschlucken.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  // Nur in Produktion – siehe Begruendung in sentry.server.config.ts.
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV === "production",
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  // Reacts Streaming-Skripte melden bei einem Hydration-Mismatch pro Teilstück
  // denselben parentNode-Fehler (Dashboard: 12x pro Aufruf, Issue BAUFIDESK-B),
  // obwohl die Seite vollständig bleibt. Nur diese Kaskade wird verworfen – die
  // Ursache (Hydration-Fehler) bleibt sichtbar. Details siehe Modul-Kommentar.
  //
  // Und genau diese Ursache ist noch offen (BAUFIDESK-E): Reacts Meldung nennt
  // sechs mögliche Gründe und keinen konkreten. Deshalb bekommt jedes
  // Hydration-Event einen Strukturfingerabdruck des DOM mit – nur Tagnamen,
  // Ids und Attributnamen, keine Inhalte. Er zeigt beim nächsten Vorfall, ob
  // eine Browser-Erweiterung den Baum vor der Hydration verändert hat.
  beforeSend: (event) =>
    isReactStreamingCascade(event)
      ? null
      : mitDomFingerabdruck(
          event,
          typeof document === "undefined"
            ? undefined
            : {
                // Kein Object.assign auf das echte `document` – die Diagnose
                // liest, sie verändert nichts an der laufenden Seite.
                documentElement: document.documentElement,
                body: document.body,
                suchparameter: window.location.search,
              }
        ),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
