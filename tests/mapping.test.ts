import { describe, it, expect } from "vitest";
import { buildPlatformMapping, europaceToEhyp } from "@/lib/platforms/mapping";
import type { CanonicalCase } from "@/lib/domain/canonical";

const baseCase: CanonicalCase = {
  caseNumber: "UP-TEST-1",
  financingType: "kauf",
  applicants: [{ position: 1, vorname: "Max", nachname: "Mustermann", geburtsdatum: "1985-04-12" }],
  employment: [{ applicantPosition: 1, beschaeftigungsart: "angestellter", arbeitgeber: "Muster GmbH" }],
  income: [{ applicantPosition: 1, nettoMonatlich: 2750 }],
  liabilities: [],
  assets: [],
  property: { objektart: "einfamilienhaus", strasse: "Musterstraße 12", plz: "76744", ort: "Wörth", wohnflaeche: 142 },
  financing: { kaufpreis: 420000, eigenkapital: 60000, darlehenswunsch: 360000 },
  platformIds: {},
};

describe("Plattform-Mapping", () => {
  it("mappt Felder für Europace", () => {
    const p = buildPlatformMapping(baseCase, "europace");
    expect(p.platform).toBe("europace");
    const all = p.groups.flatMap((g) => g.fields);
    expect(all.find((f) => f.label === "Kaufpreis")?.value).toBe(420000);
    expect(p.missingRequiredFields).toHaveLength(0);
  });

  it("erkennt fehlende Pflichtfelder", () => {
    const incomplete: CanonicalCase = { ...baseCase, property: undefined };
    const p = buildPlatformMapping(incomplete, "ehyp_home");
    expect(p.missingRequiredFields.length).toBeGreaterThan(0);
  });

  it("Europace → eHyp home liefert eHyp-Payload und Differenzen", () => {
    const res = europaceToEhyp(baseCase);
    expect(res.ehypPayload.platform).toBe("ehyp_home");
    expect(Array.isArray(res.differences)).toBe(true);
    expect(res.missingForEhyp).toHaveLength(0);
  });

  it("hat bei nur einem Antragsteller keine Antragsteller-2-Gruppe", () => {
    const p = buildPlatformMapping(baseCase, "europace");
    expect(p.groups.some((g) => g.group === "Antragsteller 2")).toBe(false);
  });

  it("mappt den zweiten Antragsteller in eine eigene Gruppe", () => {
    const zwei: CanonicalCase = {
      ...baseCase,
      applicants: [
        { position: 1, vorname: "Max", nachname: "Mustermann", geburtsdatum: "1985-04-12" },
        { position: 2, vorname: "Erika", nachname: "Mustermann", geburtsdatum: "1987-09-23" },
      ],
    };
    const p = buildPlatformMapping(zwei, "europace");
    const a2 = p.groups.find((g) => g.group === "Antragsteller 2");
    expect(a2).toBeDefined();
    expect(a2!.fields.find((f) => f.label === "Vorname")?.value).toBe("Erika");
    expect(a2!.fields.find((f) => f.platformField === "ep.antragsteller2.vorname")).toBeDefined();
    expect(p.missingRequiredFields).toHaveLength(0);
  });

  it("zählt fehlende Pflichtfelder des zweiten Antragstellers", () => {
    const zwei: CanonicalCase = {
      ...baseCase,
      applicants: [
        { position: 1, vorname: "Max", nachname: "Mustermann", geburtsdatum: "1985-04-12" },
        { position: 2, vorname: "Erika", nachname: undefined, geburtsdatum: undefined },
      ],
    };
    const p = buildPlatformMapping(zwei, "europace");
    expect(p.missingRequiredFields).toContain("ep.antragsteller2.nachname");
    expect(p.missingRequiredFields).toContain("ep.antragsteller2.geburtsdatum");
  });
});
