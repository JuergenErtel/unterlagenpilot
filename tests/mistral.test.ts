import { describe, it, expect } from "vitest";
import { AIService } from "@/lib/ai/service";
import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible-provider";

/**
 * Live-Test gegen den echten EU-Anbieter (Mistral AI).
 * Nur aktiv mit MISTRAL_LIVE=1 und gesetzten OPENAI_COMPATIBLE_* (echter API-Call).
 *   MISTRAL_LIVE=1 npx vitest run tests/mistral.test.ts
 */
const RUN = process.env.MISTRAL_LIVE === "1";

const PAYSLIP = `Entgeltabrechnung Mai 2026
Arbeitgeber: Muster GmbH, Musterweg 3, 76744 Wörth
Arbeitnehmer: Max Mustermann
Steuerklasse: 3
Gesamtbrutto: 4.200,00 EUR
Gesetzliche Abzüge Lohnsteuer, Sozialversicherung
Netto: 2.750,00 EUR
Auszahlungsbetrag: 2.750,00 EUR
Eintrittsdatum: 01.03.2018`;

describe.runIf(RUN)("Mistral (EU) – echter API-Call", () => {
  const ai = new AIService(new OpenAICompatibleProvider());

  it(
    "klassifiziert eine Gehaltsabrechnung",
    async () => {
      const res = await ai.classifyDocument(PAYSLIP);
      console.log("Klassifizierung:", JSON.stringify(res, null, 2));
      expect(res.documentType).toBe("gehaltsabrechnung");
      expect(res.confidence).toBeGreaterThan(0.5);
    },
    60_000
  );

  it(
    "extrahiert Felder mit Konfidenz",
    async () => {
      const res = await ai.extractFields("gehaltsabrechnung", PAYSLIP);
      console.log(
        "Extraktion:",
        JSON.stringify(res.fields.map((f) => ({ k: f.key, v: f.value, c: f.confidence })), null, 2)
      );
      expect(res.fields.length).toBeGreaterThan(2);
      for (const f of res.fields) {
        expect(f.confidence).toBeGreaterThanOrEqual(0);
        expect(f.confidence).toBeLessThanOrEqual(1);
      }
    },
    60_000
  );
});
