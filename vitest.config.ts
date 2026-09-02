import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  // Komponententests rendern TSX serverseitig - die automatische JSX-Laufzeit
  // spart den React-Import in jeder Komponente (wie in Next selbst).
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
