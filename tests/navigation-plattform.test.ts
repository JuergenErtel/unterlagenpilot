import { describe, it, expect } from "vitest";
import { navGruppen } from "@/components/sidebar-nav";

/**
 * Die Freigabeoberflaeche des Betreibers war ueber die Navigation gar nicht
 * erreichbar. Sichtbar sein darf sie aber nur fuer platformAdmin – der Zugang
 * selbst haengt weiterhin an requirePlatformAdmin (404 statt 403).
 */
function pfade(platformAdmin: boolean): string[] {
  return navGruppen(platformAdmin).flatMap((g) => g.items.map((i) => i.href));
}

describe("Navigation", () => {
  it("zeigt gewoehnlichen Nutzern keinen Plattform-Eintrag", () => {
    expect(pfade(false)).not.toContain("/admin/anmeldungen");
  });

  it("zeigt dem Plattformbetreiber die Anmeldungen", () => {
    expect(pfade(true)).toContain("/admin/anmeldungen");
  });

  it("laesst die uebrige Navigation unveraendert", () => {
    const ohne = pfade(false);
    expect(pfade(true).slice(0, ohne.length)).toEqual(ohne);
  });
});
