import * as Sentry from "@sentry/nextjs";

/**
 * Next.js Instrumentation-Hook: lädt die passende Sentry-Serverkonfiguration je
 * Runtime. `onRequestError` erfasst Fehler aus Server Components, Route Handlern
 * und Middleware (erfordert Next.js 15 + @sentry/nextjs ≥ 8.28).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
