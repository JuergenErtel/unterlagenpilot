import { describe, it, expect } from "vitest";
import { AIService } from "@/lib/ai/service";
import { MockAIProvider } from "@/lib/ai/mock-provider";

const ai = new AIService(new MockAIProvider());

describe("Dokumentklassifizierung & Extraktion (Mock-Provider)", () => {
  it("klassifiziert eine Gehaltsabrechnung", async () => {
    const res = await ai.classifyDocument(
      "Gehaltsabrechnung Brutto 4200 Netto 2750 Steuerklasse 3 Sozialversicherung"
    );
    expect(res.documentType).toBe("gehaltsabrechnung");
    expect(res.confidence).toBeGreaterThan(0.6);
  });

  it("klassifiziert ein Grundbuch", async () => {
    const res = await ai.classifyDocument("Grundbuch Gemarkung Wörth Flurstück 127 Abteilung III");
    expect(res.documentType).toBe("grundbuchauszug");
  });

  it("extrahiert Felder inkl. Konfidenz", async () => {
    const res = await ai.extractFields("gehaltsabrechnung", "Netto 2750 Brutto 4200");
    expect(res.fields.length).toBeGreaterThan(0);
    for (const f of res.fields) {
      expect(f.confidence).toBeGreaterThanOrEqual(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("validiert Ausgaben gegen das Schema (kein Throw bei gültiger Ausgabe)", async () => {
    await expect(ai.assessScanQuality({}, "ein lesbarer Text mit ausreichend Inhalt")).resolves.toMatchObject({
      readable: true,
    });
  });
});
