import { describe, it, expect } from "vitest";
import { planRematch, type RematchDocument } from "@/lib/documents/applicant-match";

/**
 * Der KI-Prüflauf wendet dieselbe Regel an wie das nachträgliche Umhängen:
 * angefasst wird nur, was unzugeordnet oder automatisch zugeordnet ist.
 * Diese Tests halten die Regel an der Nahtstelle des Prüflaufs fest.
 */
const paar = [
  { id: "a1", position: 1, vorname: "Laura", nachname: "Colell" },
  { id: "a2", position: 2, vorname: "Thomas", nachname: "Colell" },
];

function doc(over: Partial<RematchDocument>): RematchDocument {
  return { id: "d1", applicantId: null, applicantSource: null, detectedApplicant: null, ...over };
}

describe("KI-Prüflauf: Zuordnungsregel", () => {
  it("ordnet ein frisch erkanntes, unzugeordnetes Dokument zu", () => {
    expect(planRematch([doc({ detectedApplicant: "Thomas Colell" })], paar)).toEqual([
      { documentId: "d1", applicantId: "a2" },
    ]);
  });

  it("überschreibt die Handkorrektur des Vermittlers nicht", () => {
    expect(
      planRematch(
        [doc({ applicantId: "a1", applicantSource: "manuell", detectedApplicant: "Thomas Colell" })],
        paar
      )
    ).toEqual([]);
  });
});
