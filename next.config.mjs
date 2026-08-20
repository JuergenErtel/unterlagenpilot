/** @type {import('next').NextConfig} */
import { withSentryConfig } from "@sentry/nextjs";

// Die Content-Security-Policy wird NICHT hier gesetzt, sondern pro Request in
// `src/middleware.ts`: Sie enthaelt eine Nonce, und die gibt es nur pro Request.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  reactStrictMode: true,
  // pdfkit lädt seine AFM-Schriftdaten zur Laufzeit aus dem Paket – als externes
  // Server-Paket behandeln, damit Bundler die Datendateien nicht zerlegen.
  serverExternalPackages: ["pdfkit", "heic-convert"],
  // Sensible Daten landen nie in Build-Logs. Server-Actions Body-Limit fuer Uploads erhoehen.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  // Source-Maps-Upload nur, wenn Zugangsdaten gesetzt sind – sonst überspringt der
  // Plugin den Upload lautlos (Fehler werden trotzdem gemeldet, nur mit minifizierten
  // Stacktraces).
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Fehler-Reports laufen über die eigene Domain (/monitoring) statt direkt an
  // sentry.io: umgeht die strenge CSP (connect-src 'self') und Ad-Blocker.
  tunnelRoute: "/monitoring",
  webpack: {
    // Verkleinert das Client-Bundle: Sentry-Logger-Statements werden entfernt.
    treeshake: { removeDebugLogging: true },
    // Vercel-Cron-Monitore automatisch instrumentieren.
    automaticVercelMonitors: true,
  },
});
