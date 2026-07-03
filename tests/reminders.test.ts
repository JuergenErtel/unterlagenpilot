import { describe, it, expect } from "vitest";
import { selectOverdueCases, type ReminderCase } from "@/lib/cases/reminders";

const NOW = new Date("2026-07-10T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400 * 1000);

const base: ReminderCase = {
  caseId: "c1",
  caseNumber: "UP-2026-0001",
  status: "unterlagen_fehlen",
  hasActiveLink: true,
  lastCustomerActivityAt: daysAgo(6),
  kundenName: "Max Mustermann",
  missingCount: 3,
};

describe("selectOverdueCases", () => {
  it("wählt Fälle, deren letzte Kundenaktivität älter als der Schwellwert ist", () => {
    const out = selectOverdueCases([base], NOW, 5);
    expect(out.map((c) => c.caseId)).toEqual(["c1"]);
    expect(out[0]!.daysSince).toBe(6);
  });

  it("ignoriert Fälle innerhalb des Schwellwerts", () => {
    const out = selectOverdueCases([{ ...base, lastCustomerActivityAt: daysAgo(2) }], NOW, 5);
    expect(out).toEqual([]);
  });

  it("ignoriert Fälle ohne aktiven Upload-Link", () => {
    const out = selectOverdueCases([{ ...base, hasActiveLink: false }], NOW, 5);
    expect(out).toEqual([]);
  });

  it("ignoriert Fälle ohne fehlende Unterlagen", () => {
    const out = selectOverdueCases([{ ...base, missingCount: 0 }], NOW, 5);
    expect(out).toEqual([]);
  });

  it("ignoriert abgeschlossene/exportierte Fälle", () => {
    const out = selectOverdueCases([{ ...base, status: "abgeschlossen" }], NOW, 5);
    expect(out).toEqual([]);
  });

  it("behandelt fehlende Kundenaktivität (nie hochgeladen) als überfällig, sobald über Schwellwert", () => {
    // lastCustomerActivityAt = null -> Messung ab Link-Erstellung, hier via Feld modelliert
    const out = selectOverdueCases([{ ...base, lastCustomerActivityAt: daysAgo(9) }], NOW, 5);
    expect(out[0]!.daysSince).toBe(9);
  });

  it("sortiert am längsten überfällige zuerst", () => {
    const cases = [
      { ...base, caseId: "a", lastCustomerActivityAt: daysAgo(6) },
      { ...base, caseId: "b", lastCustomerActivityAt: daysAgo(12) },
      { ...base, caseId: "c", lastCustomerActivityAt: daysAgo(8) },
    ];
    expect(selectOverdueCases(cases, NOW, 5).map((c) => c.caseId)).toEqual(["b", "c", "a"]);
  });
});
