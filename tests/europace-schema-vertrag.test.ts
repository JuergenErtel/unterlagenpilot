import { describe, expect, it } from "vitest";
import { validateKundenangabenRequest } from "./helpers/europace-schema";

describe("Europace-Schema als Vertrag", () => {
  it("akzeptiert einen minimalen gueltigen Request", () => {
    const ergebnis = validateKundenangabenRequest({
      importMetadaten: { datenkontext: "TEST_MODUS" },
      kundenangaben: {},
    });
    expect(ergebnis.errors).toEqual([]);
    expect(ergebnis.valid).toBe(true);
  });

  it("lehnt einen Request ohne importMetadaten ab", () => {
    const ergebnis = validateKundenangabenRequest({ kundenangaben: {} });
    expect(ergebnis.valid).toBe(false);
  });

  it("lehnt einen unbekannten Datenkontext ab", () => {
    const ergebnis = validateKundenangabenRequest({
      importMetadaten: { datenkontext: "PROBIERMODUS" },
      kundenangaben: {},
    });
    expect(ergebnis.valid).toBe(false);
  });

  it("lehnt einen Kunden ohne referenzId ab", () => {
    const ergebnis = validateKundenangabenRequest({
      importMetadaten: { datenkontext: "TEST_MODUS" },
      kundenangaben: { haushalte: [{ kunden: [{ personendaten: {} }] }] },
    });
    expect(ergebnis.valid).toBe(false);
  });
});
