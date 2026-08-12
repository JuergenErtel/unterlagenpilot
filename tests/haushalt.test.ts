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

describe("Einnahmen je Antragsteller", () => {
  /**
   * Juergen im Praxistest (12.08.2026): "ich finde das Gehalt der Ehefrau
   * nicht, nur ein Gesamteinkommen." Die Rechnung summierte alle
   * Einkommenssaetze zu einer Zeile – bei zwei Verdienern liess sich nicht
   * mehr sehen, wer was beitraegt.
   */
  const basis = {
    liabilities: [],
    property: undefined,
    financing: {},
    applicantCount: 2,
    anzahlKinder: 0,
  };

  it("weist zwei Verdiener getrennt aus, mit Namen", () => {
    const r = berechneHaushalt({
      ...basis,
      income: [
        { applicantPosition: 1, nettoMonatlich: 25000 },
        { applicantPosition: 2, nettoMonatlich: 2750 },
      ],
      applicants: [
        { position: 1, vorname: "Mohammad", nachname: "Lahwani" },
        { position: 2, vorname: "Hanaa", nachname: "Naamneh" },
      ],
    } as never);
    const zeilen = r.einnahmen.filter((p) => p.label.startsWith("Nettoeinkommen"));
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]!.label).toBe("Nettoeinkommen Mohammad Lahwani");
    expect(zeilen[0]!.betrag).toBe(25000);
    expect(zeilen[1]!.label).toBe("Nettoeinkommen Hanaa Naamneh");
    expect(zeilen[1]!.betrag).toBe(2750);
  });

  it("aendert die Summe nicht – nur die Darstellung", () => {
    const eine = berechneHaushalt({
      ...basis,
      income: [{ applicantPosition: 1, nettoMonatlich: 27750 }],
    } as never);
    const zwei = berechneHaushalt({
      ...basis,
      income: [
        { applicantPosition: 1, nettoMonatlich: 25000 },
        { applicantPosition: 2, nettoMonatlich: 2750 },
      ],
      applicants: [
        { position: 1, vorname: "Mohammad", nachname: "Lahwani" },
        { position: 2, vorname: "Hanaa", nachname: "Naamneh" },
      ],
    } as never);
    expect(zwei.summeEinnahmen).toBe(eine.summeEinnahmen);
  });

  it("bleibt bei einem Verdiener bei der bisherigen Sammelzeile", () => {
    const r = berechneHaushalt({
      ...basis,
      applicantCount: 1,
      income: [{ applicantPosition: 1, nettoMonatlich: 3000 }],
    } as never);
    const zeilen = r.einnahmen.filter((p) => p.label.startsWith("Nettoeinkommen"));
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]!.label).toBe("Nettoeinkommen (alle Antragsteller)");
  });

  it("faellt ohne Namen auf die Position zurueck statt auf eine leere Zeile", () => {
    const r = berechneHaushalt({
      ...basis,
      income: [
        { applicantPosition: 1, nettoMonatlich: 4000 },
        { applicantPosition: 2, nettoMonatlich: 1500 },
      ],
    } as never);
    const zeilen = r.einnahmen.filter((p) => p.label.startsWith("Nettoeinkommen"));
    expect(zeilen.map((z) => z.label)).toEqual([
      "Nettoeinkommen Antragsteller 1",
      "Nettoeinkommen Antragsteller 2",
    ]);
  });
});
