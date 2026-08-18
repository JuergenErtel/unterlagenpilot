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

describe("Detektiv-Anstoss nach der Hintergrundanalyse", () => {
  it("ist so gebaut, dass ein Detektiv-Fehler die Analyse nicht kippt", async () => {
    const fs = await import("node:fs/promises");
    const quelle = await fs.readFile("src/lib/documents/pipeline.ts", "utf-8");

    // Die Aufrufstelle (nicht der Import!) steht NACH dem Dokument-Update und
    // in einem eigenen try/catch.
    const idxUpdate = quelle.indexOf("extractionStatus: ext");
    const idxDetektiv = quelle.indexOf("await runReferenceExtraction(");
    expect(idxUpdate).toBeGreaterThan(-1);
    expect(idxDetektiv).toBeGreaterThan(idxUpdate);
    // ... und der Fall wird danach neu abgeglichen, sonst schliesst sich ein
    // frueherer Befund nie von selbst.
    expect(quelle.indexOf("await reconcileCase(")).toBeGreaterThan(idxDetektiv);

    const umfeld = quelle.slice(idxDetektiv - 400, idxDetektiv + 400);
    expect(umfeld).toContain("try");
    expect(umfeld).toContain("catch");
  });
});
