import { describe, it, expect } from "vitest";
import { BUNDESLAND_GEOPORTALE, geoportalFor } from "@/lib/geo/geoportale";

describe("Geoportale", () => {
  it("hat 16 Bundesländer mit gültiger URL", () => {
    expect(BUNDESLAND_GEOPORTALE.length).toBe(16);
    for (const e of BUNDESLAND_GEOPORTALE) {
      expect(e.url.startsWith("https://")).toBe(true);
      expect(e.bundesland.length).toBeGreaterThan(0);
    }
  });

  it("findet ein Bundesland (auch case-insensitive) und liefert sonst den Fallback", () => {
    expect(geoportalFor("Bayern").entry.bundesland).toBe("Bayern");
    expect(geoportalFor("bayern").isFallback).toBe(false);
    expect(geoportalFor("Rheinland-Pfalz").entry.bundesland).toBe("Rheinland-Pfalz");
    expect(geoportalFor("Unbekanntland").isFallback).toBe(true);
    expect(geoportalFor(undefined).isFallback).toBe(true);
    expect(geoportalFor(null).isFallback).toBe(true);
  });
});
