import { describe, it, expect } from "vitest";
import { dokumentgrenzenSchema } from "@/lib/aufteilung/schema";
import { AIService } from "@/lib/ai/service";
import type { AIProvider } from "@/lib/ai/types";

const gueltig = {
  segmente: [
    {
      vonSeite: 1,
      bisSeite: 2,
      vermuteterTyp: "personalausweis",
      titel: "Personalausweis",
      confidence: 0.95,
    },
    {
      vonSeite: 3,
      bisSeite: 8,
      vermuteterTyp: "grundbuchauszug",
      titel: "Grundbuchauszug",
      confidence: 0.9,
    },
  ],
};

describe("KI-Antwortvertrag der Grenzerkennung", () => {
  it("nimmt eine gueltige Antwort an", () => {
    expect(dokumentgrenzenSchema.parse(gueltig).segmente).toHaveLength(2);
  });

  it("weist einen unbekannten Dokumenttyp zurueck", () => {
    const kaputt = { segmente: [{ ...gueltig.segmente[0], vermuteterTyp: "phantasie" }] };
    expect(() => dokumentgrenzenSchema.parse(kaputt)).toThrow();
  });

  it("erlaubt null als Typ – unbekannt ist besser als geraten", () => {
    const ohneTyp = { segmente: [{ ...gueltig.segmente[0], vermuteterTyp: null }] };
    expect(dokumentgrenzenSchema.parse(ohneTyp).segmente[0]!.vermuteterTyp).toBeNull();
  });

  it("weist nicht ganzzahlige Seitenzahlen zurueck", () => {
    const kaputt = { segmente: [{ ...gueltig.segmente[0], vonSeite: 1.5 }] };
    expect(() => dokumentgrenzenSchema.parse(kaputt)).toThrow();
  });

  it("akzeptiert eine leere Liste – nichts gefunden ist ein gueltiges Ergebnis", () => {
    expect(dokumentgrenzenSchema.parse({ segmente: [] }).segmente).toEqual([]);
  });
});

describe("AIService.erkenneDokumentgrenzen", () => {
  const stub = (antwort: unknown): AIProvider => ({
    name: "stub",
    isConfigured: () => true,
    completeJSON: async () => antwort,
  });

  it("liefert die validierten Segmente", async () => {
    const svc = new AIService(stub(gueltig));
    const out = await svc.erkenneDokumentgrenzen([
      { pageNumber: 1, anfang: "BUNDESREPUBLIK DEUTSCHLAND", beginntNeu: false },
      { pageNumber: 3, anfang: "Grundbuch von Musterstadt", beginntNeu: true },
    ]);
    expect(out.segmente).toHaveLength(2);
  });

  it("ruft die KI gar nicht erst auf, wenn keine Seiten uebergeben werden", async () => {
    let aufrufe = 0;
    const svc = new AIService({
      name: "zaehler",
      isConfigured: () => true,
      completeJSON: async () => {
        aufrufe++;
        return gueltig;
      },
    });
    const out = await svc.erkenneDokumentgrenzen([]);
    expect(aufrufe).toBe(0);
    expect(out.segmente).toEqual([]);
  });
});
