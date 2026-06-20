/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sensible Daten landen nie in Build-Logs. Server-Actions Body-Limit fuer Uploads erhoehen.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
