import { describe, it, expect } from "vitest";
import { AIService } from "@/lib/ai/service";
import { MockAIProvider } from "@/lib/ai/mock-provider";

const ai = new AIService(new MockAIProvider());

describe("Duplikaterkennung", () => {
  it("erkennt identische Dokumente als Duplikat", async () => {
    const text = "Gehaltsabrechnung Max Mustermann Brutto 4200 Netto 2750";
    const res = await ai.detectDuplicateDocuments({ text }, { text });
    expect(res.isDuplicate).toBe(true);
    expect(res.similarity).toBeGreaterThan(0.9);
  });

  it("erkennt unterschiedliche Dokumente nicht als Duplikat", async () => {
    const res = await ai.detectDuplicateDocuments(
      { text: "Grundbuch Gemarkung Wörth Flurstück 127" },
      { text: "Personalausweis Bundesrepublik Deutschland Mustermann" }
    );
    expect(res.isDuplicate).toBe(false);
  });
});
