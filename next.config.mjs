/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfkit lädt seine AFM-Schriftdaten zur Laufzeit aus dem Paket – als externes
  // Server-Paket behandeln, damit Bundler die Datendateien nicht zerlegen.
  serverExternalPackages: ["pdfkit"],
  // Sensible Daten landen nie in Build-Logs. Server-Actions Body-Limit fuer Uploads erhoehen.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
