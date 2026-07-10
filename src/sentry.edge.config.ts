import * as Sentry from "@sentry/nextjs";

/** Sentry – Edge-Runtime (Middleware/Edge-Funktionen). Siehe sentry.server.config.ts. */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});
