import { describe, it, expect } from "vitest";
import { generateFileName, slugify } from "@/lib/documents/filename";

describe("Dateinamen-Generierung", () => {
  it("erzeugt sinnvolle Namen für Gehaltsabrechnung", () => {
    expect(
      generateFileName({
        documentType: "gehaltsabrechnung",
        applicantName: "Max Mustermann",
        period: "2026-05",
        originalName: "scan.pdf",
      })
    ).toBe("Gehaltsabrechnung_Max_Mustermann_2026-05.pdf");
  });

  it("erzeugt Namen für Grundbuch mit Objektbezug", () => {
    expect(
      generateFileName({
        documentType: "grundbuchauszug",
        propertyRef: "Musterstraße 12, Wörth",
        originalName: "gb.PDF",
      })
    ).toBe("Grundbuch_Musterstrasse_12_Woerth.pdf");
  });

  it("behält Bildendung bei Personalausweis", () => {
    expect(
      generateFileName({ documentType: "personalausweis", applicantName: "Erika Mustermann", originalName: "foto.JPG" })
    ).toBe("Personalausweis_Erika_Mustermann.jpg");
  });

  it("slugify ersetzt Umlaute und Sonderzeichen", () => {
    expect(slugify("Wörth/Süd Ä")).toBe("Woerth_Sued_Ae");
  });
});
