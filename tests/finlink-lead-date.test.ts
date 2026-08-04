import { afterAll, describe, expect, it } from "vitest";

// Regression für Sentry f1fcca063ed041a28dd02fa044062542: Hydration-Mismatch auf
// /cases/import, weil der Vercel-Server (UTC) und der Browser (Europe/Berlin) für
// Leads, die zwischen 0 und 2 Uhr nachts angelegt wurden, unterschiedliche Daten
// rendern. Der Formatter muss deshalb auf Europe/Berlin gepinnt sein.

const originalTz = process.env.TZ;
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("formatLeadDate", () => {
  it("liefert das Berliner Datum auch auf einem UTC-Server (Mitternachts-Lead)", async () => {
    process.env.TZ = "UTC";
    const { formatLeadDate } = await import("@/components/finlink/finlink-lead-list");
    // Echter Fall aus der FinLink-API: 00:00 Uhr Berliner Zeit = 22:00 UTC des Vortags.
    expect(formatLeadDate("2026-07-31T00:00:04.956+02:00")).toBe("31.07.2026");
  });

  it("liefert dasselbe Datum in Berliner Zeitzone (Client-Seite)", async () => {
    process.env.TZ = "Europe/Berlin";
    const { formatLeadDate } = await import("@/components/finlink/finlink-lead-list");
    expect(formatLeadDate("2026-07-31T00:00:04.956+02:00")).toBe("31.07.2026");
  });

  it("formatiert einen tagsüber angelegten Lead unverändert", async () => {
    process.env.TZ = "UTC";
    const { formatLeadDate } = await import("@/components/finlink/finlink-lead-list");
    expect(formatLeadDate("2026-08-04T18:40:05.941+02:00")).toBe("04.08.2026");
  });
});
