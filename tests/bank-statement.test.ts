import { describe, it, expect } from "vitest";
import { AIService } from "@/lib/ai/service";
import type { ExtractedField } from "@/lib/domain/ai-schemas";

const ai = new AIService();
function f(key: string, value: string): ExtractedField {
  return { key, label: key, value, confidence: 0.9, source: "ki" };
}

describe("analyzeBankStatements", () => {
  it("meldet 'fehlt' ohne Felder", () => {
    const r = ai.analyzeBankStatements([]);
    expect(r.checks[0]!.status).toBe("fehlt");
  });

  it("stuft eine Pfändung als kritisch ein", () => {
    const r = ai.analyzeBankStatements([f("pfaendung", "Pfändung Finanzamt")]);
    expect(r.checks.some((c) => c.key === "bank.pfaendung" && c.status === "kritisch")).toBe(true);
  });

  it("warnt bei Rücklastschriften", () => {
    const r = ai.analyzeBankStatements([f("ruecklastschriften", "2")]);
    expect(r.checks.some((c) => c.key === "bank.ruecklastschrift" && c.status === "warnung")).toBe(true);
  });

  it("warnt bei negativem Endsaldo", () => {
    const r = ai.analyzeBankStatements([f("endsaldo", "-1.250,00 €")]);
    expect(r.checks.some((c) => c.key === "bank.dispo")).toBe(true);
  });

  it("meldet 'ok' bei unauffälligem Auszug ('keine')", () => {
    const r = ai.analyzeBankStatements([f("ruecklastschriften", "keine"), f("pfaendung", "keine"), f("endsaldo", "3.400,00 €")]);
    expect(r.checks[0]!.status).toBe("ok");
  });
});
