import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { case: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { mitFallnummer } from "@/lib/cases/fallnummer-vergabe";

/** Prisma-Unique-Verletzung, wie sie bei paralleler Anlage entsteht. */
const p2002 = Object.assign(new Error("unique"), { code: "P2002" });

beforeEach(() => findMany.mockReset());

describe("mitFallnummer", () => {
  it("vergibt die erste Nummer des Jahres, wenn es keine gibt", async () => {
    findMany.mockResolvedValue([]);
    const nummer = await mitFallnummer("org-A", 2026, async (n) => n);
    expect(nummer).toBe("UP-2026-0001");
  });

  it("zaehlt von der hoechsten bestehenden Nummer hoch", async () => {
    findMany.mockResolvedValue([{ caseNumber: "UP-2026-0007" }, { caseNumber: "UP-2026-0003" }]);
    const nummer = await mitFallnummer("org-A", 2026, async (n) => n);
    expect(nummer).toBe("UP-2026-0008");
  });

  it("zaehlt numerisch, nicht alphabetisch", async () => {
    // Der Grund, warum es diese Funktion gibt: "…-9999" ist als String
    // groesser als "…-10000". Wer das der Datenbank ueberlaesst, vergibt ab
    // dem zehntausendsten Fall dauerhaft dieselbe belegte Nummer.
    findMany.mockResolvedValue([{ caseNumber: "UP-2026-9999" }, { caseNumber: "UP-2026-10000" }]);
    const nummer = await mitFallnummer("org-A", 2026, async (n) => n);
    expect(nummer).toBe("UP-2026-10001");
  });

  it("versucht es nach einer Nummernkollision erneut", async () => {
    findMany.mockResolvedValue([{ caseNumber: "UP-2026-0001" }]);
    let aufrufe = 0;
    const ergebnis = await mitFallnummer("org-A", 2026, async (n) => {
      aufrufe++;
      if (aufrufe === 1) throw p2002;
      return n;
    });
    expect(aufrufe).toBe(2);
    expect(ergebnis).toBe("UP-2026-0002");
  });

  it("gibt einen fremden Fehler unveraendert weiter", async () => {
    findMany.mockResolvedValue([]);
    await expect(
      mitFallnummer("org-A", 2026, async () => {
        throw new Error("Datenbank weg");
      })
    ).rejects.toThrow("Datenbank weg");
  });

  it("gibt nach zu vielen Kollisionen auf, statt endlos zu kreisen", async () => {
    findMany.mockResolvedValue([]);
    await expect(
      mitFallnummer("org-A", 2026, async () => {
        throw p2002;
      })
    ).rejects.toThrow(/Fallnummer/);
  });
});
