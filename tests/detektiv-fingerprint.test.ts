import { describe, it, expect } from "vitest";
import { fingerprint, refKeyOf } from "@/lib/detektiv/fingerprint";

describe("Fingerabdruck", () => {
  const basis = { sourceDocumentId: "doc1", code: "referenz_fehlt" as const, refKey: "ur:789/2011" };

  it("ist stabil ueber Laeufe", () => {
    expect(fingerprint(basis)).toBe(fingerprint({ ...basis }));
  });

  it("unterscheidet verschiedene Urkunden", () => {
    expect(fingerprint(basis)).not.toBe(fingerprint({ ...basis, refKey: "ur:512/2004" }));
  });

  it("unterscheidet verschiedene Codes am selben Dokument", () => {
    expect(fingerprint(basis)).not.toBe(fingerprint({ ...basis, code: "anlage_fehlt" }));
  });

  it("liefert 32 Zeichen Hex", () => {
    expect(fingerprint(basis)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("refKeyOf – Vorrang der Kennungen", () => {
  it("nimmt die Urkundennummer, wenn vorhanden", () => {
    expect(
      refKeyOf({ urkundenNummer: "789/2011", urkundeDatum: "2011-08-11", label: "2. Nachtrag" })
    ).toBe("ur:789/2011");
  });

  it("faellt auf das Datum zurueck", () => {
    expect(
      refKeyOf({ urkundenNummer: null, urkundeDatum: "2011-08-11", label: "2. Nachtrag" })
    ).toBe("dat:2011-08-11");
  });

  it("faellt zuletzt auf das normalisierte Label zurueck", () => {
    expect(refKeyOf({ urkundenNummer: null, urkundeDatum: null, label: "2. Nachtrag zur TE" })).toBe(
      "lab:2nachtragzurte"
    );
  });

  it("ignoriert Schreibweise und Leerzeichen der Urkundennummer", () => {
    expect(refKeyOf({ urkundenNummer: " UR 789 / 2011 ", urkundeDatum: null, label: "x" })).toBe(
      refKeyOf({ urkundenNummer: "789/2011", urkundeDatum: null, label: "y" })
    );
  });
});
