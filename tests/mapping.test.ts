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
});
