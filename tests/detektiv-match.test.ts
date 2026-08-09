import { describe, it, expect } from "vitest";
import { matchReference, normalizeLabel, ordinalOf } from "@/lib/detektiv/match";
import type { DocReference, SelbstAuskunft } from "@/lib/detektiv/types";

const ref = (over: Partial<DocReference>): DocReference => ({
  kind: "nachtrag",
  label: "2. Nachtrag zur Teilungserklärung",
  urkundeDatum: null,
  urkundenNummer: null,
  notar: null,
  abteilung: null,
  laufendeNummer: null,
  sourcePage: 3,
  sourceQuote: "Zitat",
  confidence: 0.9,
  ...over,
});

const doc = (over: Partial<SelbstAuskunft>): SelbstAuskunft => ({
  documentId: "d1",
  documentType: "teilungserklaerung",
  label: "2. Nachtrag zur Teilungserklärung",
  urkundeDatum: null,
  urkundenNummer: null,
  ...over,
});

describe("Normalisierung", () => {
  it("loest Umlaute auf und entfernt Satzzeichen", () => {
    expect(normalizeLabel("2. Nachtrag zur Teilungserklärung")).toBe("2nachtragzurteilungserklarung");
  });

  it("vereinheitlicht Ordnungszahlen", () => {
    expect(ordinalOf("2. Nachtrag")).toBe(2);
    expect(ordinalOf("zweiter Nachtrag")).toBe(2);
    expect(ordinalOf("II. Nachtrag")).toBe(2);
    expect(ordinalOf("Nachtrag ohne Zahl")).toBeNull();
  });
});

describe("Abgleich – Stufe 1: Urkundennummer", () => {
  it("trifft sicher bei gleicher Nummer", () => {
    const r = matchReference(ref({ urkundenNummer: "789/2011" }), [doc({ urkundenNummer: "789/2011" })]);
    expect(r).toEqual({ kind: "sicher", documentId: "d1" });
  });

  it("trifft auch bei abweichender Schreibweise der Nummer", () => {
    const r = matchReference(ref({ urkundenNummer: "UR-Nr. 789 / 2011" }), [
      doc({ urkundenNummer: "789/2011" }),
    ]);
    expect(r.kind).toBe("sicher");
  });

  it("trifft nicht bei anderer Nummer", () => {
    const r = matchReference(ref({ urkundenNummer: "789/2011" }), [doc({ urkundenNummer: "512/2004" })]);
    expect(r.kind).not.toBe("sicher");
  });
});

describe("Abgleich – Stufe 2: Datum", () => {
  it("trifft sicher bei gleichem Datum", () => {
    const r = matchReference(ref({ urkundeDatum: "2011-08-11" }), [
      doc({ urkundeDatum: "2011-08-11", label: "Nachtrag" }),
    ]);
    expect(r).toEqual({ kind: "sicher", documentId: "d1" });
  });
});

describe("Abgleich – Stufe 3: unsicher", () => {
  it("meldet unsicher bei aehnlichem Label ohne Kennung", () => {
    const r = matchReference(ref({}), [doc({ label: "Zweiter Nachtrag zur Teilungserklaerung" })]);
    expect(r).toEqual({ kind: "unsicher", documentId: "d1" });
  });

  it("behauptet NICHT fehlt, wenn Ordnungszahl und Typ passen", () => {
    const r = matchReference(ref({}), [doc({ label: "II. Nachtrag TE" })]);
    expect(r.kind).toBe("unsicher");
  });

  it("meldet keinen Treffer bei abweichender Ordnungszahl", () => {
    const r = matchReference(ref({}), [doc({ label: "1. Nachtrag zur Teilungserklärung" })]);
    expect(r).toEqual({ kind: "keiner" });
  });
});

describe("Abgleich – kein Treffer", () => {
  it("meldet keinen Treffer bei leerer Akte", () => {
    expect(matchReference(ref({}), [])).toEqual({ kind: "keiner" });
  });

  it("bevorzugt den sicheren Treffer vor dem unsicheren", () => {
    const r = matchReference(ref({ urkundenNummer: "789/2011" }), [
      doc({ documentId: "unsicher", label: "2. Nachtrag zur Teilungserklärung" }),
      doc({ documentId: "sicher", urkundenNummer: "789/2011", label: "Irgendwas" }),
    ]);
    expect(r).toEqual({ kind: "sicher", documentId: "sicher" });
  });
});
