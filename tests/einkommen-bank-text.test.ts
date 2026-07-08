import { describe, it, expect } from "vitest";
import { buildSelfEmployedBankText } from "@/lib/einkommen/bank-text";

const base = {
  applicantName: "Angelina Sadykow",
  selfEmployment: { firma: "Sadykow Consulting", rechtsform: "Einzelunternehmen", gruendungsjahr: 2019 },
  gewinnByYear: [
    { jahr: 2022, betrag: 82000 },
    { jahr: 2023, betrag: 91000 },
    { jahr: 2024, betrag: 96000 },
  ],
  trend: "steigend" as const,
  documents: [{ label: "BWA 2024" }, { label: "Jahresabschluss 2023" }],
  ansatzJahr: 88000,
};

describe("buildSelfEmployedBankText", () => {
  it("baut vollständigen Text mit Firma, Jahr, Gewinnen, Ø, Ansatz", () => {
    const t = buildSelfEmployedBankText(base);
    const all = t.paragraphs.join("\n");
    expect(t.heading).toContain("selbstständige");
    expect(all).toContain("Angelina Sadykow");
    expect(all).toContain("Einzelunternehmen");
    expect(all).toContain("Sadykow Consulting");
    expect(all).toContain("seit 2019");
    expect(all).toContain("BWA 2024");
    expect(all).toContain("2023: 91.000 €");
    expect(all).toContain("Durchschnitt");
    expect(all).toContain("steigend");
    expect(all).toContain("88.000 €");
    expect(all).toMatch(/7\.333 €.*Monat/);
  });

  it("lässt fehlende Angaben weg – kein 'undefined'/'null'", () => {
    const t = buildSelfEmployedBankText({
      ...base,
      selfEmployment: { firma: null, rechtsform: null, gruendungsjahr: null },
      documents: [],
      ansatzJahr: null,
    });
    const all = t.paragraphs.join("\n");
    expect(all).not.toMatch(/undefined|null/);
    expect(all).not.toContain("seit ");
    expect(all).not.toContain("Ausgewertete Unterlagen");
    expect(all).not.toContain("nachhaltiges Jahreseinkommen");
  });

  it("nennt bei nur einem Jahr keinen Durchschnitt/Trend", () => {
    const t = buildSelfEmployedBankText({ ...base, gewinnByYear: [{ jahr: 2024, betrag: 96000 }] });
    const all = t.paragraphs.join("\n");
    expect(all).toContain("2024: 96.000 €");
    expect(all).not.toContain("Durchschnitt");
  });
});
