import { describe, it, expect } from "vitest";
import { parseNominatim } from "@/lib/geo/geocode";

describe("Geocoding-Parser (Nominatim)", () => {
  it("parst das erste Ergebnis inkl. Bundesland", () => {
    const json = [
      { lat: "49.0508", lon: "8.2731", display_name: "Ottstr. 9, 76744 Wörth am Rhein", address: { state: "Rheinland-Pfalz" } },
    ];
    const r = parseNominatim(json);
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(49.0508, 3);
    expect(r!.lon).toBeCloseTo(8.2731, 3);
    expect(r!.bundesland).toBe("Rheinland-Pfalz");
    expect(r!.displayName).toContain("Wörth");
  });

  it("liefert null bei leerem oder ungültigem Ergebnis", () => {
    expect(parseNominatim([])).toBeNull();
    expect(parseNominatim(null)).toBeNull();
    expect(parseNominatim({})).toBeNull();
    expect(parseNominatim([{ lat: "x", lon: "y", display_name: "" }])).toBeNull();
  });
});
