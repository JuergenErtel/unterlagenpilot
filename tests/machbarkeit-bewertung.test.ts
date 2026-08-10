import { describe, it, expect } from "vitest";
import { bewerte, bandFuer } from "@/lib/machbarkeit/bewertung";
import { VORGABE_ANNAHMEN } from "@/lib/machbarkeit/types";
import type { SolverEingabe } from "@/lib/machbarkeit/types";

const eingabe = (over: Partial<SolverEingabe> = {}): SolverEingabe => ({
  kaufpreis: 400_000,
  modernisierungskosten: 0,
  inventarAnteil: 0,
  nebenkostenErfasst: null,
  maklerprovisionProzent: 0,
  bundesland: "bayern",
  grunderwerbsteuerProzentOverride: null,
  eigenkapital: 100_000,
  eigenleistung: 0,
  zusatzsicherheitBeleihungsraum: 0,
  ratenkreditAnteil: 0,
  tilgungProzent: 2,
  sollzinsProzent: null,
  nettoEinkommen: 5_000,
  zusatzEinnahmen: 0,
  zusatzErwachsene: 0,
  kredite: [],
  abzuloesendeRestschuld: 0,
  bestehendeRaten: 0,
  applicantCount: 1,
  anzahlKinder: 0,
  wohnflaeche: 100,
  hausgeldMonatlich: null,
  mieteinnahmenMonatlich: 0,
  istNeubauOderModernisierung: false,
  ...over,
});

describe("Auslaufbaender", () => {
  it("setzt die beste Kondition bei 60 Prozent – der Realkreditgrenze", () => {
    expect(bandFuer(59.9)).toBe("bis60");
    expect(bandFuer(60)).toBe("bis60");
    expect(bandFuer(60.1)).toBe("bis80");
  });

  it("kennt alle Stufen bis ueber 110", () => {
    expect(bandFuer(80)).toBe("bis80");
    expect(bandFuer(85)).toBe("bis90");
    expect(bandFuer(95)).toBe("bis100");
    expect(bandFuer(105)).toBe("bis110");
    expect(bandFuer(111)).toBe("darueber");
  });
});

describe("Bewertung", () => {
  it("rechnet den Auslauf gegen den Kaufpreis, nicht gegen die Gesamtkosten", () => {
    // 400.000 KP + 14.000 GrESt + 8.000 Notar − 100.000 EK = 322.000 → 80,5 %
    const u = bewerte(eingabe(), VORGABE_ANNAHMEN);
    expect(u.darlehen).toBe(322_000);
    expect(u.beleihungswert).toBe(400_000);
    expect(u.auslauf).toBeCloseTo(80.5, 1);
  });

  it("erhoeht den Zins mit dem Band – der Aufschlag belastet den Haushalt", () => {
    // 400.000 + 22.000 NK − 190.000 EK = 232.000 → 58 %, sicher im besten Band.
    const gut = bewerte(eingabe({ eigenkapital: 190_000 }), VORGABE_ANNAHMEN);
    const knapp = bewerte(eingabe({ eigenkapital: 20_000 }), VORGABE_ANNAHMEN);
    expect(gut.band).toBe("bis60");
    expect(gut.zinsProzent).toBe(VORGABE_ANNAHMEN.basiszinsProzent);
    expect(knapp.zinsProzent).toBeGreaterThan(gut.zinsProzent);
    expect(knapp.rate).toBeGreaterThan(gut.rate);
  });

  it("nimmt einen konkreten Sollzins als Basis des aktuellen Bandes", () => {
    const u = bewerte(eingabe({ sollzinsProzent: 4.2 }), VORGABE_ANNAHMEN);
    expect(u.zinsProzent).toBe(4.2);
  });

  it("zaehlt eine Zusatzsicherheit in den Beleihungswert, ohne Bargeld", () => {
    const ohne = bewerte(eingabe({ eigenkapital: 20_000 }), VORGABE_ANNAHMEN);
    const mit = bewerte(
      eingabe({ eigenkapital: 20_000, zusatzsicherheitBeleihungsraum: 100_000 }),
      VORGABE_ANNAHMEN
    );
    expect(mit.beleihungswert).toBe(500_000);
    expect(mit.auslauf).toBeLessThan(ohne.auslauf);
    expect(mit.darlehen).toBe(ohne.darlehen);
  });

  it("zieht herausgerechnetes Inventar vom Beleihungswert ab", () => {
    const u = bewerte(eingabe({ inventarAnteil: 20_000 }), VORGABE_ANNAHMEN);
    expect(u.beleihungswert).toBe(380_000);
  });

  it("erhoeht das Darlehen um mitfinanzierte Restschulden", () => {
    const u = bewerte(eingabe({ abzuloesendeRestschuld: 8_900 }), VORGABE_ANNAHMEN);
    expect(u.darlehen).toBe(330_900);
  });

  it("nimmt den Ratenkreditanteil aus dem Baudarlehen heraus", () => {
    const u = bewerte(eingabe({ ratenkreditAnteil: 22_000 }), VORGABE_ANNAHMEN);
    expect(u.darlehen).toBe(300_000);
    expect(u.auslauf).toBeCloseTo(75, 1);
  });

  it("belastet den Haushalt mit der Ratenkreditrate", () => {
    const ohne = bewerte(eingabe(), VORGABE_ANNAHMEN);
    const mit = bewerte(eingabe({ ratenkreditAnteil: 22_000 }), VORGABE_ANNAHMEN);
    expect(mit.ratenkreditRate).toBeGreaterThan(0);
    expect(mit.ueberschuss).toBeLessThan(ohne.ueberschuss);
  });

  it("erklaert einen Fall ueber der Obergrenze fuer nicht darstellbar", () => {
    const u = bewerte(eingabe({ eigenkapital: 0, maklerprovisionProzent: 7 }), VORGABE_ANNAHMEN);
    expect(u.band).toBe("darueber");
    expect(u.machbar).toBe(false);
  });

  it("erklaert einen Fall mit negativem Ueberschuss fuer nicht machbar", () => {
    const u = bewerte(eingabe({ nettoEinkommen: 1_800 }), VORGABE_ANNAHMEN);
    expect(u.ueberschuss).toBeLessThan(0);
    expect(u.machbar).toBe(false);
  });

  it("rechnet weitere Erwachsene mit ihrer Lebenshaltungspauschale gegen", () => {
    const allein = bewerte(eingabe({ zusatzEinnahmen: 500 }), VORGABE_ANNAHMEN);
    const zuZweit = bewerte(
      eingabe({ zusatzEinnahmen: 500, zusatzErwachsene: 1 }),
      VORGABE_ANNAHMEN
    );
    expect(zuZweit.ueberschuss).toBeLessThan(allein.ueberschuss);
  });

  it("beruecksichtigt bestehende Kreditraten im Haushalt", () => {
    const ohne = bewerte(eingabe(), VORGABE_ANNAHMEN);
    const mit = bewerte(eingabe({ bestehendeRaten: 312 }), VORGABE_ANNAHMEN);
    expect(mit.ueberschuss).toBeCloseTo(ohne.ueberschuss - 312, 0);
  });
});
