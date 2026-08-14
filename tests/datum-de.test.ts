import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression fuer die Bauart hinter BAUFIDESK-D: Der Vercel-Server laeuft in
 * UTC, Jürgens Browser in Europe/Berlin. Formatiert eine CLIENT-Komponente ein
 * Datum ungepinnt, rendern beide fuer alles zwischen 0 und 2 Uhr nachts
 * verschiedene Texte – und React meldet einen Hydration-Mismatch.
 *
 * Der Test schaltet dafuer echt die Zeitzone um (process.env.TZ vor dem Import),
 * statt sie zu stubben: Intl liest sie einmal beim Anlegen des Formatters.
 */

const originalTz = process.env.TZ;
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

beforeEach(() => {
  vi.resetModules();
});

async function ladeMit(tz: string) {
  process.env.TZ = tz;
  vi.resetModules();
  return import("@/lib/datum");
}

describe("datumDe", () => {
  it("liefert auf einem UTC-Server das Berliner Datum (Mitternachts-Fall)", async () => {
    const { datumDe } = await ladeMit("UTC");
    // 00:00 Berliner Zeit im Sommer = 22:00 UTC des Vortags.
    expect(datumDe("2026-07-31T00:00:04.956+02:00")).toBe("31.07.2026");
  });

  it("liefert im Browser dasselbe Datum", async () => {
    const { datumDe } = await ladeMit("Europe/Berlin");
    expect(datumDe("2026-07-31T00:00:04.956+02:00")).toBe("31.07.2026");
  });

  it("stimmt auch im Winter überein (eine Stunde Versatz statt zwei)", async () => {
    const utc = (await ladeMit("UTC")).datumDe("2026-01-15T00:30:00.000+01:00");
    const berlin = (await ladeMit("Europe/Berlin")).datumDe("2026-01-15T00:30:00.000+01:00");
    expect(utc).toBe("15.01.2026");
    expect(berlin).toBe(utc);
  });

  it("nimmt auch ein Date-Objekt", async () => {
    const { datumDe } = await ladeMit("UTC");
    expect(datumDe(new Date("2026-08-04T18:40:05.941+02:00"))).toBe("04.08.2026");
  });

  it("zeigt für nichts einen Gedankenstrich statt „Invalid Date“", async () => {
    const { datumDe } = await ladeMit("UTC");
    expect(datumDe(null)).toBe("—");
    expect(datumDe(undefined)).toBe("—");
    expect(datumDe("kein datum")).toBe("—");
  });
});
