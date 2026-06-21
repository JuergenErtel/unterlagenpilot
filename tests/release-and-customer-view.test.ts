import { describe, it, expect } from "vitest";
import { buildPlatformMapping } from "@/lib/platforms/mapping";
import { RISK_CATALOG } from "@/lib/rules/risk-catalog";
import type { CanonicalCase } from "@/lib/domain/canonical";

const emptyCase: CanonicalCase = {
  caseNumber: "T-1",
  applicants: [{ position: 1 }],
  employment: [],
  income: [],
  liabilities: [],
  assets: [],
  financing: {},
  platformIds: {},
};

describe("Manuelle Freigabe vor Export", () => {
  it("blockt Freigabe: leerer Fall hat fehlende Pflichtfelder pro Plattform", () => {
    for (const p of ["europace", "finlink", "ehyp_home"] as const) {
      const mapping = buildPlatformMapping(emptyCase, p);
      expect(mapping.missingRequiredFields.length).toBeGreaterThan(0);
    }
  });
});

describe("Kundensicht: keine internen Hinweise", () => {
  it("interne KO-/Risiko-Befunde sind nie customerVisible", () => {
    const internalCodes = ["ACC_PFAENDUNG_INKASSO", "EMP_AUSTRITT_ERKANNT", "GB_GRUNDSCHULD_ABT3", "PLT_PFLICHTFELD_FEHLT"];
    for (const code of internalCodes) {
      const rule = RISK_CATALOG.find((r) => r.code === code);
      expect(rule?.customerVisible, `${code} darf nicht kundensichtbar sein`).toBe(false);
    }
  });

  it("kundensichtbare Hinweise haben immer einen freundlichen Kundentext", () => {
    for (const rule of RISK_CATALOG.filter((r) => r.customerVisible)) {
      expect(rule.customerText && rule.customerText.length > 10).toBe(true);
    }
  });
});
