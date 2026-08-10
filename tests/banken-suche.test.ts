import { describe, it, expect } from "vitest";
import { normalisiere, passtZurSuche } from "@/lib/banken/suche";

describe("Namenssuche", () => {
  it("loest Umlaute auf", () => {
    expect(normalisiere("München")).toBe("muenchen");
  });

  it("findet Umlautorte ueber die ae-Schreibweise", () => {
    expect(passtZurSuche("Sparkasse München", "muenchen")).toBe(true);
    expect(passtZurSuche("Sparkasse München", "münchen")).toBe(true);
  });

  it("ignoriert Gross- und Kleinschreibung", () => {
    expect(passtZurSuche("Berliner Sparkasse", "SPARKASSE")).toBe(true);
  });

  it("findet Teiltreffer mitten im Namen", () => {
    expect(passtZurSuche("VR-Bank Main-Rhön eG", "rhoen")).toBe(true);
  });

  it("liefert bei leerer Suche alles", () => {
    expect(passtZurSuche("Irgendeine Bank", "")).toBe(true);
    expect(passtZurSuche("Irgendeine Bank", "   ")).toBe(true);
  });

  it("schliesst Nichttreffer aus", () => {
    expect(passtZurSuche("1822direkt", "sparkasse")).toBe(false);
  });
});
