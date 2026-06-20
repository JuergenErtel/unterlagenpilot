import { describe, it, expect } from "vitest";
import { AIService } from "@/lib/ai/service";
import { MockAIProvider } from "@/lib/ai/mock-provider";
import type { ExtractedField } from "@/lib/domain/ai-schemas";

const ai = new AIService(new MockAIProvider());

const f = (key: string, value: ExtractedField["value"], confidence = 0.8): ExtractedField => ({
  key,
  label: key,
  value,
  confidence,
});

describe("Plausibilitätsprüfung Gehaltsabrechnung", () => {
  it("markiert Austrittsdatum als kritisches KO-Kriterium", () => {
    const res = ai.analyzePayslip([f("austrittsdatum", "2026-08-31")]);
    const austritt = res.checks.find((c) => c.key === "payslip.austritt");
    expect(austritt?.status).toBe("kritisch");
    expect(austritt?.customerVisible).toBe(false);
  });

  it("warnt bei fehlender Steuer-ID", () => {
    const res = ai.analyzePayslip([f("netto", 2750), f("auszahlungsbetrag", 2750)]);
    expect(res.checks.some((c) => c.key === "payslip.steuerId")).toBe(true);
  });

  it("warnt bei starker Abweichung Netto vs. Auszahlung", () => {
    const res = ai.analyzePayslip([f("netto", 2750), f("auszahlungsbetrag", 1500), f("steuerId", "12345678901")]);
    expect(res.checks.some((c) => c.key === "payslip.auszahlung")).toBe(true);
  });
});

describe("Plausibilitätsprüfung Grundbuch", () => {
  it("warnt bei Eintragungen in Abteilung III", () => {
    const res = ai.analyzeLandRegister([f("abteilungIII", "Grundschuld 200.000 EUR")]);
    expect(res.checks.some((c) => c.key === "landreg.abt3")).toBe(true);
  });

  it("meldet ok ohne kritische Eintragungen", () => {
    const res = ai.analyzeLandRegister([f("abteilungII", "keine Eintragungen"), f("abteilungIII", "keine Eintragungen")]);
    expect(res.checks.some((c) => c.status === "ok")).toBe(true);
  });
});
