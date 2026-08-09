import { describe, it, expect } from "vitest";
import { documentReferencesSchema } from "@/lib/detektiv/schema";
import { AIService } from "@/lib/ai/service";
import type { AIProvider } from "@/lib/ai/types";

const gueltig = {
  references: [
    {
      kind: "nachtrag",
      label: "2. Nachtrag zur Teilungserklärung",
      urkundeDatum: "2011-08-11",
      urkundenNummer: "789/2011",
      notar: "Dr. Müller",
      abteilung: "BV",
      laufendeNummer: null,
      sourcePage: 3,
      sourceQuote: "2. Nachtrag vom 11.08.2011, UR-Nr. 789/2011",
      confidence: 0.9,
    },
  ],
};

describe("KI-Antwortvertrag", () => {
  it("nimmt eine gueltige Antwort an", () => {
    expect(documentReferencesSchema.parse(gueltig).references).toHaveLength(1);
  });

  it("weist eine unbekannte kind-Angabe zurueck", () => {
    const kaputt = { references: [{ ...gueltig.references[0], kind: "phantasie" }] };
    expect(() => documentReferencesSchema.parse(kaputt)).toThrow();
  });

  it("weist ein Datum im falschen Format zurueck", () => {
    const kaputt = { references: [{ ...gueltig.references[0], urkundeDatum: "11.08.2011" }] };
    expect(() => documentReferencesSchema.parse(kaputt)).toThrow();
  });

  it("verlangt eine Fundstelle – ohne Zitat keine Nachpruefbarkeit", () => {
    const kaputt = { references: [{ ...gueltig.references[0], sourceQuote: "" }] };
    expect(() => documentReferencesSchema.parse(kaputt)).toThrow();
  });

  it("akzeptiert eine leere Liste", () => {
    expect(documentReferencesSchema.parse({ references: [] }).references).toEqual([]);
  });
});

describe("AIService.extractDocumentReferences", () => {
  const stubProvider = (antwort: unknown): AIProvider => ({
    name: "stub",
    isConfigured: () => true,
    completeJSON: async () => antwort,
  });

  it("liefert die validierten Verweise", async () => {
    const svc = new AIService(stubProvider(gueltig));
    const out = await svc.extractDocumentReferences("grundbuchauszug", [
      { pageNumber: 3, text: "2. Nachtrag vom 11.08.2011" },
    ]);
    expect(out.references[0]!.urkundenNummer).toBe("789/2011");
  });

  it("ruft die KI gar nicht erst auf, wenn keine Kandidatenseite uebergeben wird", async () => {
    let aufrufe = 0;
    const svc = new AIService({
      name: "zaehler",
      isConfigured: () => true,
      completeJSON: async () => {
        aufrufe++;
        return gueltig;
      },
    });
    const out = await svc.extractDocumentReferences("grundbuchauszug", []);
    expect(aufrufe).toBe(0);
    expect(out.references).toEqual([]);
  });
});
