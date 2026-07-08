import { describe, it, expect } from "vitest";
import {
  computeApplicantUpdate,
  parseGermanDate,
  parseAddress,
  type CurrentApplicant,
  type ExtractedFieldLike,
} from "@/lib/documents/apply-fields";

const empty: CurrentApplicant = {};

function f(key: string, label: string, value: string | null): ExtractedFieldLike {
  return { key, label, value };
}

describe("parseGermanDate", () => {
  it("parst ISO und deutsches Format", () => {
    expect(parseGermanDate("1985-04-12")?.toISOString().slice(0, 10)).toBe("1985-04-12");
    expect(parseGermanDate("12.04.1985")?.toISOString().slice(0, 10)).toBe("1985-04-12");
  });
  it("weist ungültige Daten ab (kein 500 durch Prisma)", () => {
    expect(parseGermanDate("31.02.1985")).toBeUndefined();
    expect(parseGermanDate("Quatsch")).toBeUndefined();
  });
});

describe("parseAddress", () => {
  it("zerlegt Straße/PLZ/Ort", () => {
    expect(parseAddress("Musterstraße 12, 76744 Wörth")).toEqual({
      street: "Musterstraße 12",
      zip: "76744",
      city: "Wörth",
    });
  });
});

describe("computeApplicantUpdate", () => {
  it("übernimmt Personalausweis-Stammdaten in leere Felder", () => {
    const { data, appliedLabels } = computeApplicantUpdate(
      [
        f("vorname", "Vorname", "Max"),
        f("nachname", "Nachname", "Mustermann"),
        f("geburtsdatum", "Geburtsdatum", "12.04.1985"),
        f("geburtsort", "Geburtsort", "Karlsruhe"),
      ],
      empty
    );
    expect(data.vorname).toBe("Max");
    expect(data.nachname).toBe("Mustermann");
    expect(data.geburtsdatum?.toISOString().slice(0, 10)).toBe("1985-04-12");
    expect(data.geburtsort).toBe("Karlsruhe");
    expect(appliedLabels).toHaveLength(4);
  });

  it("ist tolerant gegenüber abweichenden Keys der echten KI (Label matcht)", () => {
    const { data } = computeApplicantUpdate([f("date_of_birth", "Geburtsdatum", "1990-01-01")], empty);
    expect(data.geburtsdatum?.toISOString().slice(0, 10)).toBe("1990-01-01");
  });

  it("überschreibt vorhandene Felder NICHT (nur leere füllen)", () => {
    const current: CurrentApplicant = { geburtsdatum: new Date("1970-01-01"), vorname: "Erika" };
    const { data, appliedLabels } = computeApplicantUpdate(
      [f("vorname", "Vorname", "Max"), f("geburtsdatum", "Geburtsdatum", "12.04.1985")],
      current
    );
    expect(data.vorname).toBeUndefined();
    expect(data.geburtsdatum).toBeUndefined();
    expect(appliedLabels).toHaveLength(0);
  });

  it("mappt Familienstand auf das Enum", () => {
    expect(computeApplicantUpdate([f("familienstand", "Familienstand", "verheiratet")], empty).data.familienstand).toBe("verheiratet");
    expect(computeApplicantUpdate([f("familienstand", "Familienstand", "getrennt lebend")], empty).data.familienstand).toBe("getrennt_lebend");
  });

  it("zerlegt eine kombinierte Anschrift in Straße/PLZ/Ort", () => {
    const { data } = computeApplicantUpdate([f("anschrift", "Anschrift", "Musterstraße 12, 76744 Wörth")], empty);
    expect(data.street).toBe("Musterstraße 12");
    expect(data.zip).toBe("76744");
    expect(data.city).toBe("Wörth");
  });

  it("verunreinigt Stammdaten NICHT mit Gehalts-/Objektfeldern", () => {
    const { data, appliedLabels } = computeApplicantUpdate(
      [
        f("arbeitnehmer", "Name Arbeitnehmer", "Max Mustermann"),
        f("arbeitgeber", "Arbeitgeber", "Muster GmbH"),
        f("brutto", "Brutto", "4200"),
        f("kaufpreis", "Kaufpreis", "420000"),
        f("objektadresse", "Objektadresse", "Musterstraße 12, 76744 Wörth"),
      ],
      empty
    );
    expect(appliedLabels).toHaveLength(0);
    expect(Object.keys(data)).toHaveLength(0);
  });

  it("ignoriert leere/geräumte Werte (ignorierte Felder)", () => {
    const { appliedLabels } = computeApplicantUpdate(
      [f("vorname", "Vorname", ""), f("nachname", "Nachname", null)],
      empty
    );
    expect(appliedLabels).toHaveLength(0);
  });
});
