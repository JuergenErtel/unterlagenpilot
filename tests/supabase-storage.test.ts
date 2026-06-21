import { describe, it, expect } from "vitest";
import { getStorage } from "@/lib/storage";

/**
 * Live-Test gegen Supabase Storage (privater Bucket).
 * Nur mit SUPABASE_LIVE=1 + gesetzten SUPABASE_*-Env. Echter put/get-Roundtrip.
 *   SUPABASE_LIVE=1 npx vitest run tests/supabase-storage.test.ts
 */
const RUN = process.env.SUPABASE_LIVE === "1";

describe.runIf(RUN)("Supabase Storage – Roundtrip", () => {
  it(
    "lädt eine Datei hoch und liest sie zurück",
    async () => {
      const storage = getStorage();
      const content = `UnterlagenPilot Storage-Probe ${Date.now()}`;
      const buffer = Buffer.from(content, "utf-8");

      const stored = await storage.put({
        organizationId: "selftest-org",
        caseId: "selftest",
        originalName: "probe.txt",
        mimeType: "text/plain",
        buffer,
      });
      expect(stored.storageKey).toContain("cases/selftest/");
      expect(stored.sizeBytes).toBe(buffer.byteLength);

      const back = await storage.get(stored.storageKey);
      expect(back).not.toBeNull();
      expect(back!.toString("utf-8")).toBe(content);

      console.log("Storage-Roundtrip OK:", stored.storageKey);
    },
    60_000
  );
});
