import { describe, it, expect } from "vitest";
import { AIService } from "@/lib/ai/service";
import type { AIProvider, AICompletionRequest } from "@/lib/ai/types";

/**
 * Der Dateiname muss die Einstufung erreichen.
 *
 * Gemessen am Fall Topcic (18.08.2026): "Einkommensteuererklaerung 2024.pdf"
 * hat 56 Seiten und beginnt mit einer Steuerberechnung, die wortgleich wie ein
 * Bescheid liest – und nur die ersten 4.000 Zeichen gehen an das Modell. Gegen
 * die echte KI gelaufen:
 *
 *   ohne Dateiname -> einkommensteuerbescheid    (Konfidenz 0,99)  FALSCH
 *   mit  Dateiname -> einkommensteuererklaerung  (Konfidenz 0,99)  richtig
 *
 * Die Checkliste meldete damit ausgerechnet das Papier als vorhanden, das die
 * Bank verlangt.
 */
function providerMitMitschrift(): { provider: AIProvider; letzte: () => AICompletionRequest } {
  let letzte: AICompletionRequest | null = null;
  const provider: AIProvider = {
    name: "test",
    isConfigured: () => true,
    async completeJSON(req: AICompletionRequest) {
      letzte = req;
      return { documentType: "einkommensteuererklaerung", confidence: 0.9 };
    },
  };
  return { provider, letzte: () => letzte! };
}

describe("Einstufung: der Dateiname", () => {
  it("steht in der Anweisung an das Modell", async () => {
    const { provider, letzte } = providerMitMitschrift();
    await new AIService(provider).classifyDocument("Berechnung der Einkommensteuer", {
      originalName: "Einkommensteuererklärung 2024.pdf",
    });
    expect(letzte().user).toContain("Einkommensteuererklärung 2024.pdf");
  });

  it("wird als Hinweis gekennzeichnet – der Inhalt entscheidet", async () => {
    // Ohne diese Einordnung wuerde ein geratener Kundenname ("Scan_001.pdf",
    // "Grundbuch.pdf" fuer irgendeinen Scan) den Inhalt ueberstimmen.
    const { provider, letzte } = providerMitMitschrift();
    await new AIService(provider).classifyDocument("Irgendein Text", {
      originalName: "Grundbuch.pdf",
    });
    expect(letzte().user).toMatch(/Inhalt entscheidet/);
  });

  it("kommt ohne Dateiname aus, ohne eine leere Zeile zu erzeugen", async () => {
    const { provider, letzte } = providerMitMitschrift();
    await new AIService(provider).classifyDocument("Irgendein Text");
    expect(letzte().user).not.toMatch(/Dateiname/);
    expect(letzte().user).toContain("Irgendein Text");
  });

  it("reicht den Dokumenttext weiterhin durch", async () => {
    const { provider, letzte } = providerMitMitschrift();
    await new AIService(provider).classifyDocument("Grundbuch von Woerth Blatt 1234", {
      originalName: "scan.pdf",
    });
    expect(letzte().user).toContain("Grundbuch von Woerth Blatt 1234");
  });
});
