/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== "production";

// Ziel für den Browser-Direkt-Upload (Supabase Storage) muss in connect-src stehen,
// sonst blockt die CSP den PUT. Spezifische Origin aus der Env, sonst Wildcard.
const supabaseConnectSrc = (() => {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : "https://*.supabase.co";
  } catch {
    return "https://*.supabase.co";
  }
})();

// Content-Security-Policy: self-contained App (keine externen CDNs/Fonts/Bilder im
// Browser – KI/OCR/E-Mail/Karten laufen serverseitig). 'unsafe-inline' ist für Next.js
// ohne Nonce-Setup nötig; nonce-basierte CSP wäre die nächste Härtungsstufe.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // 'self' (nicht 'none'): das Review-Center bettet die eigene Dokument-Vorschau
  // (/api/documents/.../download) per iframe ein. Fremde Einbettung bleibt blockiert.
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // 'self' + Supabase (Direkt-Upload). Dev braucht zusätzlich die HMR-WebSocket.
  `connect-src 'self' ${supabaseConnectSrc}${isDev ? " ws: wss:" : ""}`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
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

export default nextConfig;
