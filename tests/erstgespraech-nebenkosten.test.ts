import { describe, it, expect } from "vitest";
import { nebenkostenVorschau } from "@/lib/erstgespraech/nebenkosten-vorschau";

describe("Nebenkosten-Vorschau", () => {
  it("rechnet erst, wenn ein Kaufpreis dasteht", () => {
    expect(nebenkostenVorschau({ kaufpreis: null, plz: "76744", maklerprovisionProzent: 3.57 })).toBeNull();
  });

  it("schluesselt Grunderwerbsteuer, Notar und Makler auf", () => {
    const r = nebenkostenVorschau({ kaufpreis: 895000, plz: "76744", maklerprovisionProzent: 3.57 })!;
    expect(r.grunderwerbsteuer).toBeGreaterThan(0);
    expect(r.notarGrundbuch).toBeGreaterThan(0);
    expect(r.makler).toBeCloseTo(895000 * 0.0357, 0);
    expect(r.summe).toBeCloseTo(r.grunderwerbsteuer + r.notarGrundbuch + r.makler, 0);
  });

  it("weist einen unsicheren Steuersatz aus, statt ihn zu verschweigen", () => {
    const r = nebenkostenVorschau({ kaufpreis: 400000, plz: null, maklerprovisionProzent: 0 })!;
    expect(r.steuersatzUnsicher).toBe(true);
  });

  it("laesst einen erfassten Betrag gewinnen, statt zu addieren", () => {
    const r = nebenkostenVorschau({
      kaufpreis: 895000,
      plz: "76744",
      maklerprovisionProzent: 3.57,
      nebenkostenErfasst: 60000,
    })!;
    expect(r.summe).toBe(60000);
    expect(r.gerechnet).toBe(false);
  });

  it("behandelt eine mehrdeutige PLZ ohne Ort-Treffer als unsicher, nicht als sicheren Treffer", () => {
    // 12529 liegt an der Landesgrenze Berlin/Brandenburg (siehe
    // plz-bundesland.json, Bereich "mehrdeutig"). Ohne Ort darf der Solver
    // nicht so tun, als sei das Bundesland sicher bekannt.
    const r = nebenkostenVorschau({ kaufpreis: 300000, plz: "12529", maklerprovisionProzent: 0 })!;
    expect(r.steuersatzUnsicher).toBe(true);
  });

  it("loest eine mehrdeutige PLZ per Ort auf und weist den Satz dann als sicher aus", () => {
    const r = nebenkostenVorschau({
      kaufpreis: 300000,
      plz: "12529",
      ort: "Berlin",
      maklerprovisionProzent: 0,
    })!;
    expect(r.steuersatzUnsicher).toBe(false);
  });
});
