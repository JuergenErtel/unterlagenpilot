import { describe, it, expect } from "vitest";
import { pruefeSegmente, MIN_KONFIDENZ } from "@/lib/aufteilung/pruefung";
import type { SegmentVorschlag } from "@/lib/aufteilung/types";

const seg = (over: Partial<SegmentVorschlag>): SegmentVorschlag => ({
  vonSeite: 1,
  bisSeite: 2,
  vermuteterTyp: "personalausweis",
  titel: "Personalausweis",
  confidence: 0.9,
  ...over,
});

describe("Schutzregel – wann ein Vorschlag entsteht", () => {
  it("nimmt eine saubere Aufteilung an", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis" }),
        seg({ vonSeite: 3, bisSeite: 8, vermuteterTyp: "grundbuchauszug" }),
      ],
      8
    );
    expect(r.ok).toBe(true);
  });

  it("nimmt eine unsortierte Reihenfolge an, solange sie lueckenlos ist", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 3, bisSeite: 8, vermuteterTyp: "grundbuchauszug" }),
        seg({ vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis" }),
      ],
      8
    );
    expect(r.ok).toBe(true);
  });
});

describe("Schutzregel – wann NICHT", () => {
  it("lehnt ein einzelnes Segment ab – das ist keine Aufteilung", () => {
    const r = pruefeSegmente([seg({ vonSeite: 1, bisSeite: 8 })], 8);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.grund).toMatch(/zwei/i);
  });

  it("lehnt ueberlappende Bereiche ab", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 5, vermuteterTyp: "personalausweis" }),
        seg({ vonSeite: 4, bisSeite: 8, vermuteterTyp: "grundbuchauszug" }),
      ],
      8
    );
    expect(r.ok).toBe(false);
  });

  it("lehnt Luecken zwischen den Segmenten ab", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis" }),
        seg({ vonSeite: 5, bisSeite: 8, vermuteterTyp: "grundbuchauszug" }),
      ],
      8
    );
    expect(r.ok).toBe(false);
  });

  it("lehnt ab, wenn die Segmente das Dokument nicht vollstaendig abdecken", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis" }),
        seg({ vonSeite: 3, bisSeite: 5, vermuteterTyp: "grundbuchauszug" }),
      ],
      8
    );
    expect(r.ok).toBe(false);
  });

  it("lehnt ab, wenn alle Segmente denselben Typ haben – das ist EIN Dokument", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 4, vermuteterTyp: "teilungserklaerung" }),
        seg({ vonSeite: 5, bisSeite: 8, vermuteterTyp: "teilungserklaerung" }),
      ],
      8
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.grund).toMatch(/Typ/i);
  });

  it("lehnt ab, wenn EIN Segment unsicher ist – kein Mittelwert", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis", confidence: 0.99 }),
        seg({
          vonSeite: 3,
          bisSeite: 8,
          vermuteterTyp: "grundbuchauszug",
          confidence: MIN_KONFIDENZ - 0.01,
        }),
      ],
      8
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.grund).toMatch(/unsicher|Konfidenz/i);
  });

  it("lehnt ein Segment mit ungueltigem Bereich ab", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 3, bisSeite: 1, vermuteterTyp: "personalausweis" }),
        seg({ vonSeite: 4, bisSeite: 8, vermuteterTyp: "grundbuchauszug" }),
      ],
      8
    );
    expect(r.ok).toBe(false);
  });

  it("lehnt Seitenzahlen ausserhalb des Dokuments ab", () => {
    const r = pruefeSegmente(
      [
        seg({ vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis" }),
        seg({ vonSeite: 3, bisSeite: 99, vermuteterTyp: "grundbuchauszug" }),
      ],
      8
    );
    expect(r.ok).toBe(false);
  });
});
