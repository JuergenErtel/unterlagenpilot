import { describe, it, expect } from "vitest";
import { seitenBefund, aktualitaetsBefund, MAX_ALTER_MONATE } from "@/lib/detektiv/completeness";

describe("Seitenzahl-Logik", () => {
  it("meldet fehlende Seiten, wenn 'Seite X von Y' mehr verspricht als da ist", () => {
    const b = seitenBefund(
      [
        { pageNumber: 1, text: "Seite 1 von 37" },
        { pageNumber: 2, text: "Seite 2 von 37" },
      ],
      2
    );
    expect(b).not.toBeNull();
    expect(b!.code).toBe("seiten_unvollstaendig");
    expect(b!.resolution).toBe("dokument_nachfordern");
    expect(b!.title).toContain("37");
  });

  it("erkennt auch die Schreibweise 'Blatt 3/12'", () => {
    const b = seitenBefund([{ pageNumber: 1, text: "Blatt 3/12" }], 1);
    expect(b!.title).toContain("12");
  });

  it("schweigt, wenn die Seitenzahl aufgeht", () => {
    expect(
      seitenBefund(
        [
          { pageNumber: 1, text: "Seite 1 von 2" },
          { pageNumber: 2, text: "Seite 2 von 2" },
        ],
        2
      )
    ).toBeNull();
  });

  it("schweigt ohne Seitenangabe im Text", () => {
    expect(seitenBefund([{ pageNumber: 1, text: "kein Hinweis" }], 1)).toBeNull();
  });

  it("schweigt bei unbekanntem pageCount", () => {
    expect(seitenBefund([{ pageNumber: 1, text: "Seite 1 von 9" }], null)).toBeNull();
  });

  it("nimmt die groesste gefundene Gesamtzahl", () => {
    const b = seitenBefund(
      [
        { pageNumber: 1, text: "Seite 1 von 4" },
        { pageNumber: 2, text: "Anlage: Seite 2 von 40" },
      ],
      2
    );
    expect(b!.title).toContain("40");
  });
});

describe("Aktualitaet", () => {
  const jetzt = new Date("2026-08-09T00:00:00Z");

  it("meldet einen zu alten Grundbuchauszug", () => {
    const b = aktualitaetsBefund("grundbuchauszug", new Date("2025-06-01T00:00:00Z"), jetzt);
    expect(b).not.toBeNull();
    expect(b!.code).toBe("dokument_veraltet");
    expect(b!.resolution).toBe("dokument_nachfordern");
  });

  it("schweigt bei einem frischen Grundbuchauszug", () => {
    expect(aktualitaetsBefund("grundbuchauszug", new Date("2026-07-01T00:00:00Z"), jetzt)).toBeNull();
  });

  it("schweigt bei Dokumenttypen ohne Hoechstalter", () => {
    expect(aktualitaetsBefund("teilungserklaerung", new Date("1998-03-12T00:00:00Z"), jetzt)).toBeNull();
  });

  it("schweigt ohne Dokumentdatum", () => {
    expect(aktualitaetsBefund("grundbuchauszug", null, jetzt)).toBeNull();
  });

  it("hat fuer den Grundbuchauszug 6 Monate hinterlegt", () => {
    expect(MAX_ALTER_MONATE.grundbuchauszug).toBe(6);
  });
});
