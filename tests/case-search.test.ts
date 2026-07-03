import { describe, it, expect } from "vitest";
import { normalizeSearchQuery, caseSearchOR, documentMatchWhere } from "@/lib/cases/search";

describe("normalizeSearchQuery", () => {
  it("trimmt und gibt die Query zurück", () => {
    expect(normalizeSearchQuery("  Müller ")).toBe("Müller");
  });

  it("verwirft zu kurze Eingaben (< 2 Zeichen)", () => {
    expect(normalizeSearchQuery("a")).toBeNull();
    expect(normalizeSearchQuery("  ")).toBeNull();
    expect(normalizeSearchQuery(undefined)).toBeNull();
    expect(normalizeSearchQuery(null)).toBeNull();
  });

  it("kollabiert innere Whitespaces", () => {
    expect(normalizeSearchQuery("Max    Mustermann")).toBe("Max Mustermann");
  });
});

describe("caseSearchOR", () => {
  it("sucht case-insensitiv in Fallnummer, Antragstellernamen und Dokumenten (inkl. OCR)", () => {
    const or = caseSearchOR("steuerbescheid");
    const json = JSON.stringify(or);
    // deckt Fallnummer, Antragsteller-Namen und Dokument-Relationen ab
    expect(json).toContain("caseNumber");
    expect(json).toContain("applicants");
    expect(json).toContain("vorname");
    expect(json).toContain("nachname");
    expect(json).toContain("documents");
    expect(json).toContain("ocrText");
    // case-insensitiv
    expect(json).toContain("insensitive");
    // Suchbegriff wird durchgereicht
    expect(json).toContain("steuerbescheid");
  });
});

describe("documentMatchWhere", () => {
  it("matcht auf Dateinamen und OCR-Text", () => {
    const json = JSON.stringify(documentMatchWhere("2023"));
    expect(json).toContain("generatedName");
    expect(json).toContain("originalName");
    expect(json).toContain("ocrText");
    expect(json).toContain("2023");
    expect(json).toContain("insensitive");
  });
});
