import * as Sentry from "@sentry/nextjs";

/**
 * Sentry – serverseitige Fehlererfassung (Node-Runtime).
 *
 * DSGVO-bewusst: `sendDefaultPii: false` – Sentry hängt weder IP-Adressen noch
 * Request-Bodies/Cookies an Events. Ohne gesetztes DSN läuft das SDK als No-op,
 * d. h. das Setup ist gefahrlos, solange kein DSN hinterlegt ist.
 *
 * NUR in Produktion (und in Vercel-Previews, die ebenfalls mit
 * NODE_ENV=production bauen). Vorher genügte ein gesetztes DSN – und weil das
 * DSN in `.env.local` steht, meldete jeder lokale Entwicklungslauf ins selbe
 * Projekt: halbfertige Dateien beim Tippen ("X is not defined"), Fehler der
 * lokalen Wegwerf-Datenbank, Abstürze durch einen parallelen Build. Am
 * 08.08.2026 waren so binnen 40 Minuten zehn Issues entstanden, von denen
 * keines je einen Nutzer betraf.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV === "production",
  sendDefaultPii: false,
  // Leichte Performance-Stichprobe; reine Fehlererfassung braucht das nicht zwingend.
  tracesSampleRate: 0.1,
});
