import { describe, it, expect } from "vitest";
import { kategorieFuer, KATEGORIE_REIHENFOLGE } from "@/lib/banken/kategorien";

describe("Kategoriezuordnung", () => {
  it("ordnet ein Antragstellerkriterium zu", () => {
    expect(kategorieFuer("Grenzgänger")).toBe("Antragsteller");
    expect(kategorieFuer("Auszubildende")).toBe("Antragsteller");
  });

  it("ordnet Immobilien-, Vorhaben- und Prozesskriterien zu", () => {
    expect(kategorieFuer("Ferienobjekt")).toBe("Immobilie");
    expect(kategorieFuer("Prolongation")).toBe("Vorhaben");
    expect(kategorieFuer("MaBV-Bürgschaft")).toBe("Prozesse");
  });

  it("faellt bei unbekanntem Kriterium auf Sonstige zurueck, statt zu scheitern", () => {
    expect(kategorieFuer("Völlig neues Kriterium")).toBe("Sonstige");
  });

  it("nennt die Abschnittsreihenfolge inklusive Sonstige am Ende", () => {
    expect(KATEGORIE_REIHENFOLGE[0]).toBe("Antragsteller");
    expect(KATEGORIE_REIHENFOLGE[KATEGORIE_REIHENFOLGE.length - 1]).toBe("Sonstige");
  });
});
