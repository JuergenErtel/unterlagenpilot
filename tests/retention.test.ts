import { describe, it, expect } from "vitest";
import { selectExpiredCases, type RetentionCase } from "@/lib/cases/retention";

const NOW = new Date("2026-07-10T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400 * 1000);

const base: RetentionCase = {
  caseId: "c1",
  caseNumber: "UP-2026-0001",
  status: "abgeschlossen",
  updatedAt: daysAgo(40),
  retentionDays: 30,
};

describe("selectExpiredCases", () => {
  it("wählt abgeschlossene Fälle, deren Aufbewahrungsfrist abgelaufen ist", () => {
    const out = selectExpiredCases([base], NOW);
    expect(out.map((c) => c.caseId)).toEqual(["c1"]);
    expect(out[0]!.ageDays).toBe(40);
  });

  it("löscht NICHT, wenn retentionDays 0 ist (Aufbewahrung bis manuelle Löschung)", () => {
    expect(selectExpiredCases([{ ...base, retentionDays: 0 }], NOW)).toEqual([]);
  });

  it("löscht NICHT innerhalb der Frist", () => {
    expect(selectExpiredCases([{ ...base, updatedAt: daysAgo(10) }], NOW)).toEqual([]);
  });

  it("löscht NUR terminale Fälle (abgeschlossen/archiviert), keine aktiven", () => {
    expect(selectExpiredCases([{ ...base, status: "unterlagen_fehlen" }], NOW)).toEqual([]);
    expect(selectExpiredCases([{ ...base, status: "uebertragen" }], NOW)).toEqual([]);
    expect(selectExpiredCases([{ ...base, status: "archiviert" }], NOW).length).toBe(1);
  });
});
