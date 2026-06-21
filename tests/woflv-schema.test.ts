import { describe, it, expect } from "vitest";
import { floorplanAnalysisSchema, toWoflvRooms } from "@/lib/wohnflaeche/schema";

describe("Floorplan-Analyse-Schema", () => {
  it("validiert eine KI-Ausgabe", () => {
    const parsed = floorplanAnalysisSchema.parse({
      rooms: [
        { geschoss: "EG", raumname: "Wohnen", kategorie: "wohnraum", flaecheM2: 24.5, konfidenz: 0.9, quelle: "flaeche_beschriftet" },
        { geschoss: "EG", raumname: "Bad", kategorie: "wohnraum", laengeM: 2, breiteM: 3, konfidenz: 0.6, quelle: "aus_massen_berechnet" },
      ],
    });
    expect(parsed.rooms.length).toBe(2);
  });

  it("berechnet flaecheM2 aus L×B, wenn keine Fläche angegeben", () => {
    const rooms = toWoflvRooms({
      rooms: [{ geschoss: "EG", raumname: "Bad", kategorie: "wohnraum", laengeM: 2, breiteM: 3, konfidenz: 0.6, quelle: "aus_massen_berechnet" }],
    });
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.flaecheM2).toBe(6);
    expect(rooms[0]!.id).toBeTruthy();
  });

  it("übernimmt den Dachschrägen-Hinweis und die Konfidenz", () => {
    const rooms = toWoflvRooms({
      rooms: [{ geschoss: "DG", raumname: "Schlafen", kategorie: "wohnraum", flaecheM2: 20, dachschraege: true, konfidenz: 0.6, quelle: "flaeche_beschriftet" }],
    });
    expect(rooms[0]!.dachschraegeHinweis).toBe(true);
    expect(rooms[0]!.konfidenz).toBe(0.6);
  });
});
