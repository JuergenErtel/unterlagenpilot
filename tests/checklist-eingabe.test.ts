import { describe, it, expect } from "vitest";
import {
  checklistEingabeFuerFall,
  brauchtSelbststaendigenEinkommensnachweis,
} from "@/lib/checklists/case-input";
import { buildChecklistForCase } from "@/lib/checklists/engine";

/**
 * Die gemeinsame Eingabe der Checkliste. Vorher baute jede Sicht sie selbst –
 * und jede vergass etwas anderes (die Kundensicht die Beschaeftigungsart, der
 * Erstkontakt Objektart und Nutzung). Diese Tests halten fest, dass ALLE
 * Merkmale eines Falls in die Liste einfliessen.
 */
function fall(extra: Record<string, unknown> = {}) {
  return {
    financingType: "kauf",
    primaryEmploymentType: "selbststaendiger",
    kapitalanlage: false,
    property: { objektart: "eigentumswohnung", nutzung: "vermietet" },
    applicants: [
      { id: "a2", position: 2 },
      { id: "a1", position: 1 },
    ],
    ...extra,
  };
}

function keys(f: ReturnType<typeof fall>): string[] {
  return buildChecklistForCase(checklistEingabeFuerFall(f), []).map((p) => p.key);
}

describe("Gemeinsame Checklisten-Eingabe eines Falls", () => {
  it("nimmt die Beschaeftigungsart auf – ein Selbststaendiger bekommt BWA statt Gehaltsabrechnung", () => {
    // Ein Antragsteller: sonst ergaenzt die Vorlage "mehrere Antragsteller"
    // zu Recht die Gehaltsabrechnung des Zweiten.
    const k = keys(fall({ applicants: [{ id: "a1", position: 1 }] }));
    expect(k).toContain("bwa");
    expect(k).toContain("jahresabschluss");
    expect(k).not.toContain("gehaltsabrechnung");
  });

  it("nimmt Objektart und Nutzung auf", () => {
    const k = keys(fall());
    // Eigentumswohnung -> Teilungserklaerung, vermietet -> Mietvertrag.
    expect(k).toContain("teilungserklaerung");
    expect(k).toContain("mietvertrag");
  });

  it("laesst Objektpositionen weg, solange keine Objektdaten vorliegen", () => {
    const k = keys(fall({ property: null }));
    expect(k).not.toContain("teilungserklaerung");
    expect(k).not.toContain("mietvertrag");
  });

  it("gibt die Antragsteller-IDs in der Reihenfolge ihrer Position zurueck", () => {
    const eingabe = checklistEingabeFuerFall(fall());
    expect(eingabe.applicantIds).toEqual(["a1", "a2"]);
    expect(eingabe.applicantCount).toBe(2);
  });

  it("uebersetzt fehlende Angaben in 'unbekannt' statt in falsche Vorgaben", () => {
    const eingabe = checklistEingabeFuerFall(
      fall({ financingType: null, primaryEmploymentType: null, property: undefined })
    );
    expect(eingabe.financingType).toBeUndefined();
    expect(eingabe.employmentType).toBeUndefined();
    expect(eingabe.propertyType).toBeUndefined();
    expect(eingabe.usage).toBeUndefined();
  });
});

describe("brauchtSelbststaendigenEinkommensnachweis", () => {
  // Steuert den Button "Selbständigen-Einkommen (PDF)" auf der Fallseite – das
  // Werkzeug ist EÜR-basiert und passt fachlich fuer alle vier Arten.
  it.each(["selbststaendiger", "freiberufler", "geschaeftsfuehrer", "gesellschafter"] as const)(
    "gilt fuer '%s'",
    (art) => {
      expect(brauchtSelbststaendigenEinkommensnachweis(art)).toBe(true);
    }
  );

  it.each(["angestellter", "beamter", "rentner", "sonstiges", null, undefined] as const)(
    "gilt NICHT fuer '%s'",
    (art) => {
      expect(brauchtSelbststaendigenEinkommensnachweis(art)).toBe(false);
    }
  );
});
