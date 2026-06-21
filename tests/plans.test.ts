import { describe, it, expect } from "vitest";
import { PLAN_DEFINITIONS, PLAN_ROLES } from "@/lib/saas/plans";
import { PLAN_TIERS } from "@/lib/domain/enums";

describe("SaaS-Tarife & Limits", () => {
  it("definiert alle Tarife mit Limits", () => {
    for (const tier of PLAN_TIERS) {
      const def = PLAN_DEFINITIONS[tier];
      expect(def).toBeTruthy();
      expect(def.limits).toBeTruthy();
      expect(PLAN_ROLES[tier].length).toBeGreaterThan(0);
    }
  });

  it("staffelt Limits sinnvoll (Starter begrenzt, Enterprise/White-Label offen)", () => {
    expect(PLAN_DEFINITIONS.starter.limits.monthlyCases).toBe(15);
    expect(PLAN_DEFINITIONS.starter.limits.usersPerOrg).toBe(1);
    expect(PLAN_DEFINITIONS.enterprise.limits.monthlyCases).toBeNull();
    expect(PLAN_DEFINITIONS.white_label.limits.whiteLabel).toBe(true);
    expect(PLAN_DEFINITIONS.starter.limits.whiteLabel).toBe(false);
  });

  it("nur White Label erlaubt die White-Label-Admin-Rolle", () => {
    expect(PLAN_ROLES.white_label).toContain("white_label_admin");
    expect(PLAN_ROLES.pro).not.toContain("white_label_admin");
  });
});
