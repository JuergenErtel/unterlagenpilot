import { describe, it, expect } from "vitest";
import { candidatePages } from "@/lib/detektiv/pages";

describe("Kandidatenseiten-Filter", () => {
  it("nimmt nur Seiten mit Verweis-Mustern", () => {
    const pages = [
      { pageNumber: 1, text: "Wohnungsgrundbuch von Musterstadt, Blatt 4711" },
      { pageNumber: 2, text: "Bezug: Bewilligung vom 12.03.1998, UR-Nr. 456/1998" },
      { pageNumber: 3, text: "Lageplan ohne besondere Angaben" },
      { pageNumber: 4, text: "Abteilung II: Erbbaurecht fuer die Stadt Musterstadt" },
    ];
    const out = candidatePages(pages);
    expect(out.map((p) => p.pageNumber)).toEqual([2, 4]);
  });

  it("ueberspringt Seiten ohne OCR-Text", () => {
    const out = candidatePages([
      { pageNumber: 1, text: null },
      { pageNumber: 2, text: "1. Nachtrag zur Teilungserklaerung" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.pageNumber).toBe(2);
  });

  it("deckelt auf hoechstens max Seiten", () => {
    const pages = Array.from({ length: 40 }, (_, i) => ({
      pageNumber: i + 1,
      text: `Anlage ${i + 1} zur Urkunde`,
    }));
    expect(candidatePages(pages, 12)).toHaveLength(12);
  });

  it("findet Muster unabhaengig von Gross-/Kleinschreibung und Umlauten", () => {
    const out = candidatePages([
      { pageNumber: 1, text: "abgeschlossenheitsbescheinigung liegt vor" },
      { pageNumber: 2, text: "AUFTEILUNGSPLAN Nr. 12" },
      { pageNumber: 3, text: "Teilungserklärung nebst Nachträgen" },
    ]);
    expect(out.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
  });

  it("liefert bei fehlenden Treffern eine leere Liste (kein Fehler)", () => {
    expect(candidatePages([{ pageNumber: 1, text: "nichts davon hier" }])).toEqual([]);
  });
});
