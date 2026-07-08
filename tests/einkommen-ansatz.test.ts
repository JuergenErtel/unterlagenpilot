import { describe, it, expect } from "vitest";
import { suggestEinkommensansatz } from "@/lib/einkommen/ansatz";
import type { ConsolidatedMatrix } from "@/lib/einkommen/consolidate";

function matrix(gewinn: Record<number, number> | null, extraRows: string[] = []): ConsolidatedMatrix {
  const jahre = gewinn ? Object.keys(gewinn).map(Number).sort((a, b) => a - b) : [];
  const rows: ConsolidatedMatrix["rows"] = [];
  if (gewinn) {
    rows.push({
      kennzahl: "gewinn",
      trend: "unbekannt",
      cells: Object.fromEntries(Object.entries(gewinn).map(([j, v]) => [Number(j), { value: v, conflict: false, alle: [v] }])),
    });
  }
  for (const k of extraRows) {
    rows.push({ kennzahl: k as never, trend: "unbekannt", cells: { 2023: { value: 1, conflict: false, alle: [1] } } });
  }
  return { jahre: jahre.length ? jahre : [2023], rows };
}

describe("suggestEinkommensansatz", () => {
  it("mittelt den Gewinn der letzten 3 Jahre, abgerundet auf 100 €", () => {
    // (82000+91000+96000)/3 = 89666,67 -> floor auf 100 = 89600
    expect(suggestEinkommensansatz(matrix({ 2022: 82000, 2023: 91000, 2024: 96000 }))).toBe(89600);
  });
  it("nimmt nur die letzten 3 Jahre bei mehr Jahren", () => {
    // letzte 3: 2022..2024 -> (60000+70000+80000)/3 = 70000
    expect(suggestEinkommensansatz(matrix({ 2021: 10000, 2022: 60000, 2023: 70000, 2024: 80000 }))).toBe(70000);
  });
  it("bezieht Verlustjahre mit ein", () => {
    // (-20000+40000)/2 = 10000
    expect(suggestEinkommensansatz(matrix({ 2023: -20000, 2024: 40000 }))).toBe(10000);
  });
  it("gibt null zurück, wenn keine Gewinn-Zeile existiert", () => {
    expect(suggestEinkommensansatz(matrix(null, ["umsatz"]))).toBeNull();
  });
});
