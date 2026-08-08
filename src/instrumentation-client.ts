import * as Sentry from "@sentry/nextjs";
import { isReactStreamingCascade } from "@/lib/observability/react-streaming-noise";

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
  beforeSend: (event) => (isReactStreamingCascade(event) ? null : event),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
