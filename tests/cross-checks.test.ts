import { describe, it, expect } from "vitest";
import { crossDocumentChecks, parseGermanNumber, namesOverlap } from "@/lib/ai/cross-checks";
import type { ExtractedField } from "@/lib/domain/ai-schemas";

function f(key: string, value: string): ExtractedField {
  return { key, label: key, value, confidence: 0.9, source: "ki" };
}

describe("parseGermanNumber", () => {
  it("parst deutsche Beträge", () => {
    expect(parseGermanNumber("349.000,00 €")).toBe(349000);
    expect(parseGermanNumber("2.850,50")).toBe(2850.5);
    expect(parseGermanNumber("1500")).toBe(1500);
  });
  it("gibt null bei Unparsbarem", () => {
    expect(parseGermanNumber("")).toBeNull();
    expect(parseGermanNumber(null)).toBeNull();
    expect(parseGermanNumber("k.A.")).toBeNull();
  });
});

describe("namesOverlap", () => {
  it("erkennt gemeinsame Namensbestandteile", () => {
    expect(namesOverlap("Max Mustermann", "Mustermann, Max")).toBe(true);
    expect(namesOverlap("Erika Musterfrau", "Max Mustermann")).toBe(false);
  });
});

describe("crossDocumentChecks", () => {
  it("meldet abweichende Kaufpreise zwischen Vertrag und Antrag", () => {
    const checks = crossDocumentChecks(
      { financing: { kaufpreis: 400000 } },
      [{ documentType: "kaufvertragsentwurf", fields: [f("kaufpreis", "350.000 €")] }]
    );
    expect(checks.some((c) => c.category === "Kaufpreis")).toBe(true);
  });

  it("meldet KEINE Abweichung bei gleichem Kaufpreis (±1 %)", () => {
    const checks = crossDocumentChecks(
      { financing: { kaufpreis: 350000 } },
      [{ documentType: "kaufvertragsentwurf", fields: [f("kaufpreis", "350.000 €")] }]
    );
    expect(checks.some((c) => c.category === "Kaufpreis")).toBe(false);
  });

  it("meldet abweichende Eigentümer/Verkäufer", () => {
    const checks = crossDocumentChecks({}, [
      { documentType: "grundbuchauszug", fields: [f("eigentuemer", "Klaus Schmidt")] },
      { documentType: "kaufvertragsentwurf", fields: [f("verkaeufer", "Petra Meier")] },
    ]);
    expect(checks.some((c) => c.key === "plaus.eigentuemer_verkaeufer")).toBe(true);
  });

  it("akzeptiert übereinstimmende Eigentümer/Verkäufer", () => {
    const checks = crossDocumentChecks({}, [
      { documentType: "grundbuchauszug", fields: [f("eigentuemer", "Klaus Schmidt")] },
      { documentType: "kaufvertragsentwurf", fields: [f("verkaeufer", "Schmidt, Klaus")] },
    ]);
    expect(checks.some((c) => c.key === "plaus.eigentuemer_verkaeufer")).toBe(false);
  });

  it("meldet Netto-Abweichung >10 % zwischen Gehaltsabrechnung und Angabe", () => {
    const checks = crossDocumentChecks(
      { income: [{ applicantPosition: 1, nettoMonatlich: 3500 }] },
      [{ documentType: "gehaltsabrechnung", fields: [f("netto", "2.800,00")] }]
    );
    expect(checks.some((c) => c.key === "plaus.netto_abgleich")).toBe(true);
  });

  it("meldet Kontoinhaber, der zu keinem Antragsteller passt", () => {
    const checks = crossDocumentChecks(
      { applicants: [{ position: 1, vorname: "Max", nachname: "Mustermann" }] },
      [{ documentType: "kontoauszug", fields: [f("kontoinhaber", "Petra Meier")] }]
    );
    expect(checks.some((c) => c.key === "plaus.kontoinhaber")).toBe(true);
  });
});
