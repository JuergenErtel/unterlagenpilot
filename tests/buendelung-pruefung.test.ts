import { describe, it, expect } from "vitest";
import { pruefeBuendel, zeitraumKonflikt } from "@/lib/buendelung/pruefung";
import type { Kandidat } from "@/lib/buendelung/kandidaten";
import type { BuendelVorschlag } from "@/lib/buendelung/types";

function k(id: string, over: Partial<Kandidat> = {}): Kandidat {
  return {
    id,
    originalName: `${id}.jpg`,
    mimeType: "image/jpeg",
    pageCount: 1,
    reviewStatus: "offen",
    ocrStatus: "fertig",
    readable: true,
    zusammengefuegtInId: null,
    documentType: null,
    period: null,
    createdAt: new Date("2026-08-28T10:00:00Z"),
    text: "",
    ...over,
  };
}

function v(seiten: number[], over: Partial<BuendelVorschlag> = {}): BuendelVorschlag {
  return { titel: "Bündel", vermuteterTyp: null, confidence: 0.9, seiten, ...over };
}

const VIER = [k("a"), k("b"), k("c"), k("d")];

describe("pruefeBuendel", () => {
  it("nimmt ein sauberes Bündel an", () => {
    const { angenommen, verworfen } = pruefeBuendel([v([0, 1])], VIER);
    expect(angenommen).toHaveLength(1);
    expect(verworfen).toHaveLength(0);
  });

  it("verwirft eine erfundene Seitennummer", () => {
    const { angenommen, verworfen } = pruefeBuendel([v([0, 99])], VIER);
    expect(angenommen).toHaveLength(0);
    expect(verworfen[0]!.grund).toMatch(/gibt es nicht/i);
  });

  it("verwirft ein Bündel mit nur einer Seite", () => {
    const { angenommen, verworfen } = pruefeBuendel([v([0])], VIER);
    expect(angenommen).toHaveLength(0);
    expect(verworfen[0]!.grund).toMatch(/eine einzelne Seite/i);
  });

  it("verwirft dieselbe Seite zweimal im selben Bündel", () => {
    const { angenommen, verworfen } = pruefeBuendel([v([0, 0])], VIER);
    expect(angenommen).toHaveLength(0);
    expect(verworfen[0]!.grund).toMatch(/zweimal/i);
  });

  it("verwirft ein zu unsicheres Bündel", () => {
    const { angenommen, verworfen } = pruefeBuendel([v([0, 1], { confidence: 0.4 })], VIER);
    expect(angenommen).toHaveLength(0);
    expect(verworfen[0]!.grund).toMatch(/unsicher/i);
  });

  it("verwirft Mai und Juni im selben Bündel", () => {
    // Die wichtigste Sperre: sonst verschmelzen zwei Gehaltsabrechnungen zu
    // einem Dokument, die Checkliste meldet Gruen, und die fehlende dritte
    // faellt erst der Bank auf.
    const kandidaten = [k("a", { period: "2026-05" }), k("b", { period: "2026-06" })];
    const { angenommen, verworfen } = pruefeBuendel([v([0, 1])], kandidaten);
    expect(angenommen).toHaveLength(0);
    expect(verworfen[0]!.grund).toMatch(/Zeitraum/i);
  });

  it("stoert sich nicht an einem fehlenden Zeitraum", () => {
    // Seite 2 einer Abrechnung traegt oft keinen erkennbaren Monat.
    const kandidaten = [k("a", { period: "2026-05" }), k("b", { period: null })];
    expect(pruefeBuendel([v([0, 1])], kandidaten).angenommen).toHaveLength(1);
  });

  it("verwirft nur das zweite Bündel, wenn eine Seite in beiden steht", () => {
    const { angenommen, verworfen } = pruefeBuendel(
      [v([0, 1], { titel: "Erstes" }), v([1, 2], { titel: "Zweites" })],
      VIER
    );
    expect(angenommen.map((x) => x.titel)).toEqual(["Erstes"]);
    expect(verworfen[0]!.titel).toBe("Zweites");
    expect(verworfen[0]!.grund).toMatch(/anderen Bündel/i);
  });

  it("laesst nicht zugeordnete Seiten einfach liegen", () => {
    // Anders als beim Auftrennen ist Nichtzuordnung hier der Normalfall.
    const { angenommen, verworfen } = pruefeBuendel([v([0, 1])], VIER);
    expect(angenommen[0]!.seiten).toEqual([0, 1]);
    expect(verworfen).toHaveLength(0);
  });

  it("behaelt die von der KI gewaehlte Seitenreihenfolge", () => {
    expect(pruefeBuendel([v([2, 0, 1])], VIER).angenommen[0]!.seiten).toEqual([2, 0, 1]);
  });
});

// Schlussbefund 1: Diese Funktion ist seit dem Fix die EINE Stelle fuer die
// wichtigste Sperre - genutzt von pruefeBuendel oben (KI-Pfad) UND von
// fuegeZusammen in service.ts (Handauswahl). Direkt getestet, statt nur
// indirekt ueber pruefeBuendel, damit ein Auseinanderlaufen der beiden
// Aufrufer sofort auffiele.
describe("zeitraumKonflikt", () => {
  it("meldet zwei verschiedene Zeitraeume, sortiert", () => {
    expect(zeitraumKonflikt(["2026-06", "2026-05"])).toEqual(["2026-05", "2026-06"]);
  });

  it("meldet nichts bei genau einem Zeitraum", () => {
    expect(zeitraumKonflikt(["2026-05", "2026-05"])).toBeNull();
  });

  it("meldet nichts, wenn kein Zeitraum erkannt ist", () => {
    expect(zeitraumKonflikt([null, null])).toBeNull();
  });

  it("stoert sich nicht an einem fehlenden Zeitraum neben einem erkannten", () => {
    expect(zeitraumKonflikt(["2026-05", null])).toBeNull();
  });
});
