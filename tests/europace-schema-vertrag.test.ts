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

  /**
   * Keines der 337 Schemas setzt `additionalProperties` – ohne die
   * Schliessung in `helpers/europace-schema.ts` (`unbekannteFelderSchliessen`)
   * waeren beide folgenden Faelle identisch "gueltig", weil unbekannte
   * Schluessel nach reiner JSON-Schema-Lesart erlaubt sind.
   */
  it("akzeptiert eine korrekt benannte Beschaeftigung mit Beschaeftigungsverhaeltnis", () => {
    const ergebnis = validateKundenangabenRequest({
      importMetadaten: { datenkontext: "TEST_MODUS" },
      kundenangaben: {
        haushalte: [
          {
            kunden: [
              {
                referenzId: "antragsteller-1",
                finanzielles: {
                  beschaeftigung: {
                    "@type": "ANGESTELLTER",
                    beruf: "Projektleiterin",
                    beschaeftigungsverhaeltnis: {
                      arbeitgeber: { name: "Beispiel GmbH" },
                      beschaeftigtSeit: "2019-03-01",
                      probezeit: false,
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    });
    expect(ergebnis.errors).toEqual([]);
    expect(ergebnis.valid).toBe(true);
  });

  it("lehnt einen vertippten Feldnamen unterhalb von beschaeftigungsverhaeltnis ab", () => {
    const ergebnis = validateKundenangabenRequest({
      importMetadaten: { datenkontext: "TEST_MODUS" },
      kundenangaben: {
        haushalte: [
          {
            kunden: [
              {
                referenzId: "antragsteller-1",
                finanzielles: {
                  beschaeftigung: {
                    "@type": "ANGESTELLTER",
                    beruf: "Projektleiterin",
                    // Tippfehler: "arbeitgeberName" statt arbeitgeber: { name: ... }
                    beschaeftigungsverhaeltnis: { arbeitgeberName: "Beispiel GmbH" },
                  },
                },
              },
            ],
          },
        ],
      },
    });
    expect(ergebnis.valid).toBe(false);
    expect(
      ergebnis.errors.some((e) => e.includes("additional properties"))
    ).toBe(true);
  });
});
