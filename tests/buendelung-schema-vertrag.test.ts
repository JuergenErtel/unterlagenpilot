import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
});

import { buendelungSchema } from "@/lib/buendelung/schema";

describe("Vertrag mit der KI (Bündelung)", () => {
  it("nimmt eine gültige Antwort an", () => {
    const parsed = buendelungSchema.parse({
      buendel: [{ titel: "Gehaltsabrechnung 05/2026", vermuteterTyp: "gehaltsabrechnung", confidence: 0.92, seiten: [2, 0, 1] }],
    });
    expect(parsed.buendel[0]!.seiten).toEqual([2, 0, 1]);
  });

  it("erlaubt einen unbekannten Typ als null - geraten waere schlimmer", () => {
    expect(() =>
      buendelungSchema.parse({ buendel: [{ titel: "Unklar", vermuteterTyp: null, confidence: 0.8, seiten: [0, 1] }] })
    ).not.toThrow();
  });

  it("lehnt einen erfundenen Dokumenttyp ab", () => {
    expect(() =>
      buendelungSchema.parse({ buendel: [{ titel: "X", vermuteterTyp: "mondschein", confidence: 0.8, seiten: [0, 1] }] })
    ).toThrow();
  });

  it("lehnt ein Bündel mit weniger als zwei Seiten ab", () => {
    expect(() =>
      buendelungSchema.parse({ buendel: [{ titel: "X", vermuteterTyp: null, confidence: 0.8, seiten: [0] }] })
    ).toThrow();
  });

  it("lehnt negative Seitennummern ab", () => {
    expect(() =>
      buendelungSchema.parse({ buendel: [{ titel: "X", vermuteterTyp: null, confidence: 0.8, seiten: [0, -1] }] })
    ).toThrow();
  });

  it("die leere Antwort ist gültig - nicht jeder Fall hat Bündel", () => {
    expect(buendelungSchema.parse({ buendel: [] }).buendel).toEqual([]);
  });

  it("der Mock-Anbieter liefert eine schemakonforme Antwort", async () => {
    const { AIService } = await import("@/lib/ai/service");
    const ai = new AIService();
    const antwort = await ai.gruppiereEinzelseiten([
      { nummer: 0, dateiname: "IMG_1.jpg", hochgeladen: "2026-08-28T10:00:00Z", erkannterTyp: null, zeitraum: null, seitenzaehler: true, anfang: "Gehaltsabrechnung Seite 1 von 2" },
      { nummer: 1, dateiname: "IMG_2.jpg", hochgeladen: "2026-08-28T10:01:00Z", erkannterTyp: null, zeitraum: null, seitenzaehler: false, anfang: "Seite 2 von 2" },
    ]);
    expect(() => buendelungSchema.parse(antwort)).not.toThrow();
    expect(antwort.buendel[0]!.seiten).toEqual([0, 1]);
  });

  it("ohne Seiten wird die KI gar nicht erst gefragt", async () => {
    const { AIService } = await import("@/lib/ai/service");
    expect((await new AIService().gruppiereEinzelseiten([])).buendel).toEqual([]);
  });
});
