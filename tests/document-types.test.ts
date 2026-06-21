import { describe, it, expect } from "vitest";
import { AIService } from "@/lib/ai/service";
import { MockAIProvider } from "@/lib/ai/mock-provider";
import { DOCUMENT_TYPE_SPECS, requiredFields } from "@/lib/documents/document-types";
import { DOCUMENT_TYPES } from "@/lib/domain/enums";
import { getRiskRule } from "@/lib/rules/risk-catalog";

const ai = new AIService(new MockAIProvider());

describe("Dokumenttyp-Registry", () => {
  it("deckt alle DocumentType-Enums ab", () => {
    for (const t of DOCUMENT_TYPES) {
      expect(DOCUMENT_TYPE_SPECS[t], `Spec für ${t} fehlt`).toBeTruthy();
    }
  });

  it("referenzierte Warnungscodes existieren im KO-Katalog", () => {
    for (const spec of Object.values(DOCUMENT_TYPE_SPECS)) {
      for (const code of spec.warningCodes) {
        expect(getRiskRule(code), `Code ${code} nicht im Katalog`).toBeTruthy();
      }
    }
  });

  it("neue Dokumenttypen werden klassifiziert (Kontoauszug, BWA, Kaufvertrag)", async () => {
    expect((await ai.classifyDocument("Kontoauszug IBAN DE12 Saldo Rücklastschrift")).documentType).toBe("kontoauszug");
    expect((await ai.classifyDocument("Betriebswirtschaftliche Auswertung BWA Gesamtleistung")).documentType).toBe("bwa");
    expect((await ai.classifyDocument("Kaufvertrag Notar Auflassung Käufer Verkäufer")).documentType).toBe("kaufvertragsentwurf");
  });

  it("liefert für vorbereitete Typen die Pflichtfelder als Extraktionsschema", async () => {
    const res = await ai.extractFields("eigenkapitalnachweis", "Depotauszug Guthaben");
    const keys = res.fields.map((f) => f.key);
    for (const rf of requiredFields("eigenkapitalnachweis")) {
      expect(keys).toContain(rf.key);
    }
  });
});
