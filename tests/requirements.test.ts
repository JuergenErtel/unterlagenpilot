import { describe, it, expect } from "vitest";
import { evaluateRequirements } from "@/lib/rules/requirements";

describe("Bank- & plattformbezogene Nachforderungen (Rules Engine)", () => {
  it("fügt Europace-Pflichtanforderungen hinzu", () => {
    const rules = evaluateRequirements({ platforms: ["europace"] });
    expect(rules.some((r) => r.key === "europace.einkommensnachweis")).toBe(true);
  });

  it("fügt eHyp-home-Objektnachweis hinzu", () => {
    const rules = evaluateRequirements({ platforms: ["ehyp_home"] });
    expect(rules.some((r) => r.key === "ehyp.grundbuch")).toBe(true);
  });

  it("fügt Selbstständigen-Anforderungen hinzu", () => {
    const rules = evaluateRequirements({ employmentType: "selbststaendiger" });
    expect(rules.some((r) => r.documentType === "bwa")).toBe(true);
    expect(rules.some((r) => r.documentType === "jahresabschluss")).toBe(true);
  });

  it("fügt bankindividuelle Anforderung hinzu", () => {
    const rules = evaluateRequirements({ bankName: "Muster Bank AG" });
    expect(rules.some((r) => r.bank === "Muster Bank AG")).toBe(true);
  });

  it("dedupliziert Anforderungen nach key", () => {
    const rules = evaluateRequirements({ platforms: ["europace", "europace"] });
    const keys = rules.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
