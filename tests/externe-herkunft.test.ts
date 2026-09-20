import { describe, expect, it } from "vitest";
import { LeadSource } from "@prisma/client";

/**
 * Die externe Herkunft am Fall ist die Dublettensperre der Lead-Uebergabe.
 * Der eindeutige Index dazu liegt in der Datenbank (Prisma: @@unique auf
 * organizationId + externeQuelle + externeId) und laesst sich hier nicht
 * pruefen – der Enum-Wert schon, und ohne ihn kaeme keine Uebergabe an.
 */
describe("Externe Herkunft am Fall", () => {
  it("kennt baufivergleicher als Quelle", () => {
    expect(LeadSource.baufivergleicher).toBe("baufivergleicher");
  });

  it("laesst die bestehenden Quellen unberuehrt", () => {
    expect(LeadSource.finlink ?? LeadSource.immoscout24).toBeDefined();
    expect(LeadSource.webformular).toBe("webformular");
    expect(LeadSource.manuell).toBe("manuell");
  });
});
