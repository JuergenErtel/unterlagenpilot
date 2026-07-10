import { describe, it, expect } from "vitest";
import { buildPipeline, courtageOf, type PipelineCaseInput } from "@/lib/cases/pipeline";

function c(over: Partial<PipelineCaseInput> = {}): PipelineCaseInput {
  return {
    caseId: "x", caseNumber: "UP-2026-0001", kundenName: "Max", status: "uebertragen",
    abschlussBank: "ING", darlehensbetrag: null, courtageProzent: null, abschlussdatum: null, ...over,
  };
}

describe("courtageOf", () => {
  it("rechnet Darlehen × Satz", () => {
    expect(courtageOf(300000, 1)).toBe(3000);
  });
  it("gibt null ohne vollständige Werte", () => {
    expect(courtageOf(300000, null)).toBeNull();
    expect(courtageOf(null, 1)).toBeNull();
  });
});

describe("buildPipeline", () => {
  it("trennt abgeschlossene von offenen Fällen und summiert Courtage", () => {
    const p = buildPipeline([
      c({ caseId: "a", status: "abgeschlossen", darlehensbetrag: 300000, courtageProzent: 1 }),
      c({ caseId: "b", status: "uebertragen", darlehensbetrag: 200000, courtageProzent: 1.5 }),
    ]);
    expect(p.abgeschlossen).toHaveLength(1);
    expect(p.offen).toHaveLength(1);
    expect(p.courtageAbgeschlossen).toBe(3000);
    expect(p.couragePipeline).toBe(3000);
  });

  it("ignoriert Fälle ohne berechenbare Courtage in der Summe", () => {
    const p = buildPipeline([c({ status: "abgeschlossen", darlehensbetrag: null, courtageProzent: null })]);
    expect(p.courtageAbgeschlossen).toBe(0);
  });
});
