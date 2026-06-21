import { describe, it, expect } from "vitest";
import {
  RISK_CATALOG,
  RISK_CATEGORIES,
  getRiskRule,
  risksByCategory,
  customerVisibleRisks,
} from "@/lib/rules/risk-catalog";

describe("KO-/Risiko-Katalog", () => {
  it("hat eindeutige Codes", () => {
    const codes = RISK_CATALOG.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("deckt alle Kategorien ab", () => {
    for (const cat of RISK_CATEGORIES) {
      expect(risksByCategory(cat).length).toBeGreaterThan(0);
    }
  });

  it("kundensichtbare Regeln haben einen Kundentext, interne KO-Kriterien sind nie kundensichtbar", () => {
    for (const r of customerVisibleRisks()) {
      expect(r.customerText, `${r.code} braucht customerText`).toBeTruthy();
    }
    // Konto-Pfändung & Plattform-Pflichtfelder dürfen NIE in der Kundensicht auftauchen.
    expect(getRiskRule("ACC_PFAENDUNG_INKASSO")?.customerVisible).toBe(false);
    expect(getRiskRule("PLT_PFLICHTFELD_FEHLT")?.customerVisible).toBe(false);
  });

  it("jede Regel hat eine empfohlene Aktion und gültigen Schweregrad", () => {
    for (const r of RISK_CATALOG) {
      expect(r.recommendedAction.length).toBeGreaterThan(3);
      expect(["info", "warnung", "kritisch", "blocker"]).toContain(r.severity);
    }
  });
});
