import { describe, it, expect } from "vitest";
import { leiteQuelleAb } from "@/lib/platforms/finlink/source";

describe("leiteQuelleAb", () => {
  it("erkennt ImmoScout am source_type", () => {
    expect(leiteQuelleAb({ sourceType: "ImmoscoutLead" })).toEqual({
      quelle: "immoscout24",
      detail: "ImmoscoutLead",
    });
  });

  it("erkennt Europace am source_type", () => {
    expect(leiteQuelleAb({ sourceType: "EuropaceCase" }).quelle).toBe("europace");
  });

  it("erkennt Europace auch am Freitext in source", () => {
    expect(
      leiteQuelleAb({ source: "Imported via Europace by Organization: ISH GmbH" }).quelle
    ).toBe("europace");
  });

  it("erkennt Baufi24 am Leadshop", () => {
    expect(leiteQuelleAb({ source: "Leadshop" })).toEqual({
      quelle: "baufi24",
      detail: "Leadshop",
    });
  });

  it("liefert 'unbekannt', wenn beide Felder leer sind", () => {
    expect(leiteQuelleAb({})).toEqual({ quelle: "unbekannt", detail: null });
    expect(leiteQuelleAb({ sourceType: null, source: "" })).toEqual({
      quelle: "unbekannt",
      detail: null,
    });
  });

  it("behält den Rohwert, wenn der Wert unbekannt ist", () => {
    // Kommt morgen ein neuer Quellentyp, darf der Originalwert nicht verloren
    // gehen – sonst muss man raten, was passiert ist.
    expect(leiteQuelleAb({ sourceType: "TiktokLead" })).toEqual({
      quelle: "unbekannt",
      detail: "TiktokLead",
    });
  });

  it("bevorzugt source_type gegenüber source", () => {
    expect(leiteQuelleAb({ sourceType: "ImmoscoutLead", source: "Leadshop" }).quelle).toBe(
      "immoscout24"
    );
  });
});
