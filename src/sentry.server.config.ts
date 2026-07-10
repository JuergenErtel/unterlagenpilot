import * as Sentry from "@sentry/nextjs";

/**
 * Sentry – serverseitige Fehlererfassung (Node-Runtime).
 *
 * DSGVO-bewusst: `sendDefaultPii: false` – Sentry hängt weder IP-Adressen noch
 * Request-Bodies/Cookies an Events. Ohne gesetztes DSN läuft das SDK als No-op,
 * d. h. das Setup ist gefahrlos, solange kein DSN hinterlegt ist.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  // Leichte Performance-Stichprobe; reine Fehlererfassung braucht das nicht zwingend.
  tracesSampleRate: 0.1,
});
