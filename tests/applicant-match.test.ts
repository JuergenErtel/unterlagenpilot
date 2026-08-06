import { describe, it, expect } from "vitest";
import {
  matchApplicant,
  planRematch,
  type ApplicantCandidate,
  type RematchDocument,
} from "@/lib/documents/applicant-match";

const laura: ApplicantCandidate = { id: "a1", position: 1, vorname: "Laura", nachname: "Colell" };
const thomas: ApplicantCandidate = { id: "a2", position: 2, vorname: "Thomas", nachname: "Colell" };
const paar = [laura, thomas];

describe("matchApplicant", () => {
  it("ordnet bei genau einem Antragsteller immer diesem zu", () => {
    expect(matchApplicant(null, [laura])).toBe("a1");
    expect(matchApplicant("Wer auch immer", [laura])).toBe("a1");
  });

  it("gibt null ohne Antragsteller", () => {
    expect(matchApplicant("Laura Colell", [])).toBeNull();
  });

  it("unterscheidet Eheleute mit gleichem Nachnamen über den Vornamen", () => {
    expect(matchApplicant("Thomas Colell", paar)).toBe("a2");
    expect(matchApplicant("Laura Colell", paar)).toBe("a1");
  });

  it("ordnet nicht zu, wenn nur der Nachname erkannt wurde", () => {
    expect(matchApplicant("Herr Colell", paar)).toBeNull();
  });

  it("ordnet ohne erkannten Namen nicht zu", () => {
    expect(matchApplicant(null, paar)).toBeNull();
    expect(matchApplicant("   ", paar)).toBeNull();
  });

  it("ignoriert Groß-/Kleinschreibung und Reihenfolge", () => {
    expect(matchApplicant("COLELL, thomas", paar)).toBe("a2");
  });

  it("löst Umlaute und ß auf", () => {
    const paare = [
      { id: "b1", position: 1, vorname: "Jürgen", nachname: "Groß" },
      { id: "b2", position: 2, vorname: "Anna", nachname: "Groß" },
    ];
    expect(matchApplicant("Juergen Gross", paare)).toBe("b1");
    expect(matchApplicant("Jürgen Groß", paare)).toBe("b1");
  });

  it("behandelt Bindestrich-Doppelnamen als eigene Wörter", () => {
    const paare = [
      { id: "c1", position: 1, vorname: "Anna-Lena", nachname: "Meier-Schmidt" },
      { id: "c2", position: 2, vorname: "Bernd", nachname: "Meier-Schmidt" },
    ];
    expect(matchApplicant("Anna-Lena Meier-Schmidt", paare)).toBe("c1");
    expect(matchApplicant("Anna Lena Meier Schmidt", paare)).toBe("c1");
  });

  it("greift nicht per Teilstring (Berg trifft nicht Bergmann)", () => {
    const paare = [
      { id: "d1", position: 1, vorname: "Otto", nachname: "Berg" },
      { id: "d2", position: 2, vorname: "Otto", nachname: "Bergmann" },
    ];
    expect(matchApplicant("Otto Bergmann", paare)).toBe("d2");
  });

  it("ordnet namenlosen Antragstellern nichts zu", () => {
    const mitLeerem = [laura, { id: "a2", position: 2, vorname: null, nachname: null }];
    expect(matchApplicant("Thomas Colell", mitLeerem)).toBeNull();
    expect(matchApplicant("Laura Colell", mitLeerem)).toBe("a1");
  });

  it("ordnet nicht zu, wenn zwei Kandidaten passen", () => {
    const zwillinge = [
      { id: "e1", position: 1, vorname: "Max", nachname: "Muster" },
      { id: "e2", position: 2, vorname: "Max", nachname: "Muster" },
    ];
    expect(matchApplicant("Max Muster", zwillinge)).toBeNull();
  });
});

function doc(over: Partial<RematchDocument> = {}): RematchDocument {
  return { id: "d1", applicantId: null, applicantSource: null, detectedApplicant: null, ...over };
}

describe("planRematch", () => {
  it("hängt eine automatische Zuordnung auf die erkannte Person um", () => {
    const changes = planRematch(
      [doc({ id: "d1", applicantId: "a1", applicantSource: "auto", detectedApplicant: "Thomas Colell" })],
      paar
    );
    expect(changes).toEqual([{ documentId: "d1", applicantId: "a2" }]);
  });

  it("fasst manuelle Zuordnungen nie an", () => {
    const changes = planRematch(
      [doc({ id: "d1", applicantId: "a1", applicantSource: "manuell", detectedApplicant: "Thomas Colell" })],
      paar
    );
    expect(changes).toEqual([]);
  });

  it("fasst Bestandsdaten mit Zuordnung, aber ohne Herkunft, nicht an", () => {
    const changes = planRematch(
      [doc({ id: "d1", applicantId: "a1", applicantSource: null, detectedApplicant: "Thomas Colell" })],
      paar
    );
    expect(changes).toEqual([]);
  });

  it("ordnet unzugeordnete Bestandsdaten zu", () => {
    const changes = planRematch(
      [doc({ id: "d1", applicantId: null, applicantSource: null, detectedApplicant: "Thomas Colell" })],
      paar
    );
    expect(changes).toEqual([{ documentId: "d1", applicantId: "a2" }]);
  });

  it("lässt eine bestehende Zuordnung stehen, wenn kein Name erkannt wurde", () => {
    const changes = planRematch(
      [doc({ id: "d1", applicantId: "a1", applicantSource: "auto", detectedApplicant: null })],
      paar
    );
    expect(changes).toEqual([]);
  });

  it("meldet keine Änderung, wenn die Zuordnung schon stimmt", () => {
    const changes = planRematch(
      [doc({ id: "d1", applicantId: "a2", applicantSource: "auto", detectedApplicant: "Thomas Colell" })],
      paar
    );
    expect(changes).toEqual([]);
  });
});
