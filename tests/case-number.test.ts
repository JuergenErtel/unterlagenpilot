import { describe, it, expect } from "vitest";
import { computeNextCaseNumber, highestSequence, formatCaseNumber } from "@/lib/cases/case-number";

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

describe("highestSequence (numerisch statt lexikografisch)", () => {
  it("findet die höchste Nummer auch jenseits von 9999", () => {
    // "UP-2026-9999" > "UP-2026-10000" im STRING-Vergleich – genau daran scheiterte
    // die Vergabe zuvor dauerhaft.
    expect(highestSequence(["UP-2026-9999", "UP-2026-10000", "UP-2026-0001"])).toBe(10000);
  });

  it("liefert 0 für eine leere Menge", () => {
    expect(highestSequence([])).toBe(0);
  });

  it("ignoriert Nummern ohne erkennbare Laufnummer", () => {
    expect(highestSequence(["UP-2026-", "UP-2026-0007"])).toBe(7);
  });

  it("formatCaseNumber polstert auf 4 Stellen, wächst aber darüber hinaus", () => {
    expect(formatCaseNumber(2026, 7)).toBe("UP-2026-0007");
    expect(formatCaseNumber(2026, 10001)).toBe("UP-2026-10001");
  });
});
