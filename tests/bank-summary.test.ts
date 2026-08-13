import { describe, it, expect } from "vitest";
import { AIService } from "@/lib/ai/service";

/**
 * Regression: `createBankSummary` prüfte lange
 * `beschaeftigungsart === "selbststaendiger"` und übersah damit jede andere
 * EÜR-basierte Beschäftigungsart. Als "freelancer" am 12.08.2026 nicht mehr
 * auf "selbststaendiger", sondern auf "freiberufler" abgebildet wurde, verlor
 * das Bank-PDF den Hinweis auf Selbstständigenunterlagen für Freiberufler
 * ersatzlos. Die zentrale Menge dafür ist
 * `brauchtSelbststaendigenEinkommensnachweis` (case-input.ts) – dieselbe, die
 * schon die Fallseite fürs EÜR-Werkzeug nutzt.
 */

const ai = new AIService();

describe("createBankSummary – Selbststaendigkeits-Hinweis", () => {
  it("setzt den Hinweis für einen klassischen Selbststaendigen", () => {
    const summary = ai.createBankSummary({
      applicants: [{ position: 1, vorname: "Max", nachname: "Muster" }],
      employment: [{ applicantPosition: 1, beschaeftigungsart: "selbststaendiger" }],
    });
    expect(summary.selbststaendigkeit).toContain("Selbstständigenunterlagen");
  });

  it("setzt den Hinweis auch für einen Freiberufler (Regression)", () => {
    const summary = ai.createBankSummary({
      applicants: [{ position: 1, vorname: "Max", nachname: "Muster" }],
      employment: [{ applicantPosition: 1, beschaeftigungsart: "freiberufler" }],
    });
    expect(summary.selbststaendigkeit).toContain("Selbstständigenunterlagen");
  });

  it("setzt den Hinweis auch für Geschäftsführer und Gesellschafter", () => {
    const gf = ai.createBankSummary({
      applicants: [{ position: 1 }],
      employment: [{ applicantPosition: 1, beschaeftigungsart: "geschaeftsfuehrer" }],
    });
    expect(gf.selbststaendigkeit).toContain("Selbstständigenunterlagen");

    const ges = ai.createBankSummary({
      applicants: [{ position: 1 }],
      employment: [{ applicantPosition: 1, beschaeftigungsart: "gesellschafter" }],
    });
    expect(ges.selbststaendigkeit).toContain("Selbstständigenunterlagen");
  });

  it("bleibt null für einen Angestellten", () => {
    const summary = ai.createBankSummary({
      applicants: [{ position: 1 }],
      employment: [{ applicantPosition: 1, beschaeftigungsart: "angestellter" }],
    });
    expect(summary.selbststaendigkeit).toBeNull();
  });
});
