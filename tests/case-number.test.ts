import { describe, it, expect } from "vitest";
import { computeNextCaseNumber } from "@/lib/cases/case-number";

describe("computeNextCaseNumber", () => {
  it("startet bei 0001, wenn noch keine Fälle existieren", () => {
    expect(computeNextCaseNumber(null, 2026)).toBe("UP-2026-0001");
  });

  it("zählt vom höchsten bestehenden Fall hoch (nicht vom Count)", () => {
    // count+1 würde nach einer Löschung kollidieren; max+1 nicht.
    expect(computeNextCaseNumber("UP-2026-0007", 2026)).toBe("UP-2026-0008");
  });

  it("nutzt den höchsten Wert des Jahres, auch bei Lücken durch Löschung", () => {
    // Höchster verbleibender Fall ist 0009 (0003 wurde gelöscht) -> nächster 0010.
    expect(computeNextCaseNumber("UP-2026-0009", 2026)).toBe("UP-2026-0010");
  });

  it("beginnt in einem neuen Jahr wieder bei 0001", () => {
    expect(computeNextCaseNumber(null, 2027)).toBe("UP-2027-0001");
  });
});
