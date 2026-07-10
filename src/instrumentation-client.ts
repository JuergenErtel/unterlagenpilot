import * as Sentry from "@sentry/nextjs";

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
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
