import { describe, it, expect } from "vitest";
import { buildBoard, liegezeitTage, type BoardKarte } from "@/lib/cases/lead-board";

const JETZT = new Date("2026-08-07T12:00:00Z");
const tageVorher = (n: number) => new Date(JETZT.getTime() - n * 86400_000);

function karte(over: Partial<BoardKarte> = {}): BoardKarte {
  return {
    caseId: "c1",
    caseNumber: "UP-2026-0001",
    kundenName: "Muster",
    volumen: 300000,
    quelle: "ImmoScout24",
    leadPhase: "neu",
    leadPhaseSeit: tageVorher(1),
    wiedervorlage: null,
    verlorenAm: null,
    verlorenGrund: null,
    vorschlag: null,
    ...over,
  };
}

describe("buildBoard", () => {
  it("legt für jede Phase eine Spalte an, auch wenn sie leer ist", () => {
    const { spalten } = buildBoard([], JETZT);
    expect(spalten).toHaveLength(7);
    expect(spalten[0]!.phase).toBe("neu");
    expect(spalten[0]!.titel).toBe("Neu");
    expect(spalten[6]!.titel).toBe("Finanzierung abgeschlossen");
  });

  it("zählt Karten und summiert das Volumen je Spalte", () => {
    const { spalten } = buildBoard(
      [
        karte({ caseId: "a", volumen: 300000 }),
        karte({ caseId: "b", volumen: 200000 }),
        karte({ caseId: "c", volumen: 500000, leadPhase: "zusage" }),
      ],
      JETZT
    );
    const neu = spalten.find((s) => s.phase === "neu")!;
    expect(neu.anzahl).toBe(2);
    expect(neu.summe).toBe(500000);
    expect(spalten.find((s) => s.phase === "zusage")!.summe).toBe(500000);
  });

  it("ignoriert Fälle ohne Volumen in der Summe, zählt sie aber mit", () => {
    const { spalten } = buildBoard(
      [karte({ caseId: "a", volumen: null }), karte({ caseId: "b", volumen: 100000 })],
      JETZT
    );
    const neu = spalten.find((s) => s.phase === "neu")!;
    expect(neu.anzahl).toBe(2);
    expect(neu.summe).toBe(100000);
  });

  it("sortiert je Spalte nach Liegezeit, das Älteste oben", () => {
    const { spalten } = buildBoard(
      [
        karte({ caseId: "jung", leadPhaseSeit: tageVorher(1) }),
        karte({ caseId: "alt", leadPhaseSeit: tageVorher(30) }),
        karte({ caseId: "mittel", leadPhaseSeit: tageVorher(7) }),
      ],
      JETZT
    );
    expect(spalten[0]!.karten.map((k) => k.caseId)).toEqual(["alt", "mittel", "jung"]);
  });

  it("hält verlorene Fälle aus den Phasenspalten heraus", () => {
    const { spalten, verloren } = buildBoard(
      [
        karte({ caseId: "offen" }),
        karte({ caseId: "weg", verlorenAm: tageVorher(3), verlorenGrund: "kondition" }),
      ],
      JETZT
    );
    expect(spalten.find((s) => s.phase === "neu")!.anzahl).toBe(1);
    expect(verloren.anzahl).toBe(1);
    expect(verloren.karten[0]!.caseId).toBe("weg");
  });

  it("deckelt die Kartenzahl je Spalte und meldet den Rest", () => {
    const viele = Array.from({ length: 55 }, (_, i) =>
      karte({ caseId: `c${i}`, leadPhaseSeit: tageVorher(i + 1) })
    );
    const { spalten } = buildBoard(viele, JETZT, 50);
    const neu = spalten.find((s) => s.phase === "neu")!;
    expect(neu.karten).toHaveLength(50);
    expect(neu.weitere).toBe(5);
    // Anzahl und Summe zählen weiterhin ALLE Karten – sonst lügt der Spaltenkopf.
    expect(neu.anzahl).toBe(55);
  });

  it("rechnet die Liegezeit in vollen Tagen", () => {
    expect(liegezeitTage(tageVorher(6), JETZT)).toBe(6);
    expect(liegezeitTage(JETZT, JETZT)).toBe(0);
  });
});
