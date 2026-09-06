import { describe, it, expect } from "vitest";
import { erkenneFehlendeSeiten, SEITEN_FEHLEN_CODE } from "@/lib/documents/seitenzaehlung";

/**
 * Fall Schmidt, 06.09.2026: Der "Grundbuchauszug" war eine einzelne Seite
 * mit der Fusszeile "Seite 5 von 9". Die KI stufte ihn als Grundbuchauszug ein,
 * die Checkliste meldete Gruen. Aus einem einzigen Blatt Abteilung I laesst
 * sich weder Flurstueck noch Belastung ablesen.
 */
describe("erkenneFehlendeSeiten", () => {
  it("erkennt aus der Fusszeile, dass Seiten fehlen", () => {
    const e = erkenneFehlendeSeiten([{ ocrText: "Grundbuch von Fischbach ... Ausdruck vom 21.08.2026 · Seite 5 von 9" }]);
    expect(e).toEqual({ fehlen: true, gesamt: 9, vorhanden: [5], hinweis: "Nur Seite 5 von 9 vorhanden" });
  });

  it("nennt bei mehreren vorhandenen Seiten die Zahl", () => {
    const e = erkenneFehlendeSeiten([
      { ocrText: "... Seite 1 von 4" },
      { ocrText: "... Seite 2 von 4" },
    ]);
    expect(e?.fehlen).toBe(true);
    expect(e?.hinweis).toBe("Nur 2 von 4 Seiten vorhanden");
  });

  it("meldet nichts, wenn alle Seiten da sind", () => {
    const e = erkenneFehlendeSeiten([{ ocrText: "Seite 1 von 2" }, { ocrText: "Seite 2 von 2" }]);
    expect(e?.fehlen).toBe(false);
  });

  it("versteht Seite 3/7, Blatt 2 von 5 und Page 1 of 3", () => {
    expect(erkenneFehlendeSeiten([{ ocrText: "Seite 3/7" }])?.gesamt).toBe(7);
    expect(erkenneFehlendeSeiten([{ ocrText: "Blatt 2 von 5" }])?.gesamt).toBe(5);
    expect(erkenneFehlendeSeiten([{ ocrText: "Page 1 of 3" }])?.gesamt).toBe(3);
  });

  it("gibt null zurueck, wenn keine Fusszeile zu finden ist", () => {
    expect(erkenneFehlendeSeiten([{ ocrText: "Gehaltsabrechnung Mai 2026" }])).toBeNull();
    expect(erkenneFehlendeSeiten([{ ocrText: null }])).toBeNull();
  });

  it("laesst ein Buendel aus mehreren kurzen Dokumenten in Ruhe", () => {
    // Drei Gehaltsabrechnungen zu je "Seite 1 von 1" in einem PDF: nichts fehlt.
    const e = erkenneFehlendeSeiten([{ ocrText: "Seite 1 von 1" }, { ocrText: "Seite 1 von 1" }, { ocrText: "Seite 1 von 1" }]);
    expect(e?.fehlen).toBe(false);
  });

  it("traut einer Zahl groesser als 500 nicht (OCR-Rauschen)", () => {
    expect(erkenneFehlendeSeiten([{ ocrText: "Seite 1 von 1234" }])).toBeNull();
  });

  it("hat einen festen Warncode fuer die Anzeige", () => {
    expect(SEITEN_FEHLEN_CODE).toBe("SEITEN_FEHLEN");
  });
});
