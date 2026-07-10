import { describe, it, expect } from "vitest";
import { berechneHaushalt, DEFAULT_ANNAHMEN } from "@/lib/haushalt/rechnung";

describe("berechneHaushalt", () => {
  it("berechnet einen tragfähigen Haushalt mit Überschuss", () => {
    const r = berechneHaushalt({
      income: [{ applicantPosition: 1, nettoMonatlich: 3500 }],
      liabilities: [],
      property: { wohnflaeche: 100 },
      financing: { darlehenswunsch: 300000 }, // Stress-Rate 6 % → 1500 €/Monat
      applicantCount: 1,
      anzahlKinder: 0,
    });
    // Einnahmen 3500, Lebenshaltung -700, Bewirtschaftung -300 (100 m² × 3 €), Rate -1500
    expect(r.summeEinnahmen).toBe(3500);
    expect(r.geplanteRate).toBe(1500);
    expect(r.rateGeschaetzt).toBe(true);
    expect(r.ueberschuss).toBe(3500 - 700 - 300 - 1500);
    expect(r.tragfaehig).toBe(true);
  });

  it("erkennt einen nicht tragfähigen Haushalt (negativer Überschuss)", () => {
    const r = berechneHaushalt({
      income: [{ applicantPosition: 1, nettoMonatlich: 1800 }],
      liabilities: [{ monatlicheRate: 400, abzuloesen: false }],
      property: { wohnflaeche: 120 },
      financing: { darlehenswunsch: 300000 },
      applicantCount: 2,
      anzahlKinder: 2,
    });
    expect(r.tragfaehig).toBe(false);
    expect(r.ueberschuss).toBeLessThan(0);
  });

  it("rechnet abzulösende Kredite NICHT als laufende Ausgabe (werden mitfinanziert)", () => {
    const mit = berechneHaushalt({
      income: [{ applicantPosition: 1, nettoMonatlich: 3000 }],
      liabilities: [{ monatlicheRate: 500, abzuloesen: true }],
      property: undefined,
      financing: { darlehenswunsch: 0 },
      applicantCount: 1,
    });
    // Nur Lebenshaltung als Ausgabe, die abzulösende Rate fällt weg.
    expect(mit.summeAusgaben).toBe(-DEFAULT_ANNAHMEN.lebenshaltungErsteErwachsene);
  });

  it("nutzt den konkreten Sollzins statt der Stress-Annahme, wenn vorhanden", () => {
    const r = berechneHaushalt({
      income: [{ applicantPosition: 1, nettoMonatlich: 4000 }],
      liabilities: [],
      property: undefined,
      financing: { darlehensbetrag: 240000, sollzinsProzent: 3 }, // 3 % + 2 % Tilgung = 5 % → 1000 €
      applicantCount: 1,
    });
    expect(r.rateGeschaetzt).toBe(false);
    expect(r.geplanteRate).toBe(1000);
  });

  it("skaliert die Lebenshaltung mit Erwachsenen und Kindern", () => {
    const r = berechneHaushalt({
      income: [{ applicantPosition: 1, nettoMonatlich: 5000 }],
      liabilities: [],
      property: undefined,
      financing: { darlehenswunsch: 0 },
      applicantCount: 2,
      anzahlKinder: 1,
    });
    // 700 + 300 (2. Erw.) + 250 (Kind) = 1250
    expect(r.summeAusgaben).toBe(-1250);
  });

  it("bevorzugt erfasstes Hausgeld gegenüber der m²-Schätzung", () => {
    const r = berechneHaushalt({
      income: [{ applicantPosition: 1, nettoMonatlich: 3000 }],
      liabilities: [],
      property: { wohnflaeche: 100, hausgeldMonatlich: 450 },
      financing: { darlehenswunsch: 0 },
      applicantCount: 1,
    });
    const bewirtschaftung = r.ausgaben.find((p) => p.label === "Objektbewirtschaftung");
    expect(bewirtschaftung?.betrag).toBe(-450);
  });
});
