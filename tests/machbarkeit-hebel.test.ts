import { describe, it, expect } from "vitest";
import { HEBEL } from "@/lib/machbarkeit/hebel";
import { VORGABE_ANNAHMEN } from "@/lib/machbarkeit/types";
import { bewerte } from "@/lib/machbarkeit/bewertung";
import type { SolverEingabe } from "@/lib/machbarkeit/types";

const eingabe = (over: Partial<SolverEingabe> = {}): SolverEingabe => ({
  kaufpreis: 400_000,
  modernisierungskosten: 0,
  objektwert: null,
  weitererDarlehensbedarf: 0,
  darlehensbedarfVerhandelbar: false,
  vorrangigeRestschuld: 0,
  inventarAnteil: 0,
  nebenkostenErfasst: null,
  maklerprovisionProzent: 0,
  bundesland: "bayern",
  grunderwerbsteuerProzentOverride: null,
  eigenkapital: 40_000,
  eigenleistung: 0,
  zusatzsicherheitBeleihungsraum: 0,
  ratenkreditAnteil: 0,
  tilgungProzent: 2,
  sollzinsProzent: null,
  wunschrateMonatlich: null,
  nettoEinkommen: 3_200,
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

const hebel = (key: string) => {
  const h = HEBEL.find((x) => x.key === key);
  if (!h) throw new Error(`Hebel ${key} fehlt`);
  return h;
};

describe("Hebelkatalog", () => {
  it("hat elf Eintraege mit eindeutigen Schluesseln", () => {
    // Zehn fachliche Hebel; "Einnahmen erhoehen" steht mit seinen beiden
    // Auspraegungen als zwei Eintraege, weil sie unterschiedlich wirken:
    // der weitere Darlehensnehmer bringt seine Lebenshaltung mit.
    //
    // "kaufpreis" und "darlehenssumme" sind Geschwister und schliessen sich
    // gegenseitig aus: Wo ein Kaufpreis steht, ist er verhandelbar; wo keiner
    // steht, ist es die Darlehenssumme (16.08.2026).
    expect(HEBEL).toHaveLength(11);
    expect(new Set(HEBEL.map((h) => h.key)).size).toBe(11);
  });

  it("kennzeichnet jeden Hebel als datengestuetzt oder hypothetisch", () => {
    for (const h of HEBEL) {
      expect(["datengestuetzt", "hypothetisch"], h.key).toContain(h.sorte);
    }
  });

  it("hat fuer jeden Hebel einen kundentauglichen Titel", () => {
    for (const h of HEBEL) {
      expect(h.titel.length, h.key).toBeGreaterThan(5);
      expect(h.titel, h.key).not.toMatch(/[a-z]+_[a-z]+/);
    }
  });

  it("nennt zu jedem Hebel einen Preis", () => {
    for (const h of HEBEL) {
      expect(h.preis(eingabe(), 1_000).length, h.key).toBeGreaterThan(10);
    }
  });
});

describe("Eigenkapital-Hebel", () => {
  it("senkt Darlehen und Auslauf", () => {
    const e = eingabe();
    const vor = bewerte(e, VORGABE_ANNAHMEN);
    const nach = bewerte(hebel("eigenkapital").anwenden(e, 30_000), VORGABE_ANNAHMEN);
    expect(nach.darlehen).toBe(vor.darlehen - 30_000);
    expect(nach.auslauf).toBeLessThan(vor.auslauf);
  });

  it("ist immer anwendbar – er ist die Frage an den Kunden", () => {
    expect(hebel("eigenkapital").anwendbar(eingabe(), VORGABE_ANNAHMEN).ok).toBe(true);
  });
});

describe("Konsumkredit-Hebel", () => {
  const mitKrediten = eingabe({
    kredite: [
      { id: "k1", bezeichnung: "Autokredit", restschuld: 8_900, rate: 312 },
      { id: "k2", bezeichnung: "Ratenkauf", restschuld: 1_200, rate: 60 },
    ],
    bestehendeRaten: 372,
  });

  it("ist nicht anwendbar ohne Kredite", () => {
    expect(hebel("konsumkredit").anwendbar(eingabe(), VORGABE_ANNAHMEN).ok).toBe(false);
  });

  it("ist diskret und enumeriert alle Teilmengen", () => {
    const h = hebel("konsumkredit");
    expect(h.diskret).toBe(true);
    const a = h.anwendbar(mitKrediten, VORGABE_ANNAHMEN);
    expect(a.ok && a.max).toBe(3); // 2^2 − 1
  });

  it("erhoeht bei Auswahl das Darlehen und entlastet den Haushalt", () => {
    const nachher = hebel("konsumkredit").anwenden(mitKrediten, 1);
    expect(nachher.abzuloesendeRestschuld).toBe(8_900);
    expect(nachher.bestehendeRaten).toBe(60);
  });

  it("nennt im Format die tatsaechlich gewaehlten Kredite", () => {
    const text = hebel("konsumkredit").formatWert(mitKrediten, 1);
    expect(text).toContain("Autokredit");
    expect(text).not.toContain("Ratenkauf");
  });
});

describe("Tilgungs-Hebel", () => {
  it("geht nicht unter die Mindesttilgung", () => {
    const a = hebel("tilgung").anwendbar(eingabe(), VORGABE_ANNAHMEN);
    expect(a.ok && a.max).toBeCloseTo(2 - VORGABE_ANNAHMEN.mindestTilgungProzent, 5);
  });

  it("senkt die Rate, laesst den Auslauf unveraendert", () => {
    const e = eingabe();
    const vor = bewerte(e, VORGABE_ANNAHMEN);
    const nach = bewerte(hebel("tilgung").anwenden(e, 0.5), VORGABE_ANNAHMEN);
    expect(nach.rate).toBeLessThan(vor.rate);
    expect(nach.auslauf).toBe(vor.auslauf);
  });

  it("ist nicht anwendbar, wenn schon die Mindesttilgung gilt", () => {
    expect(hebel("tilgung").anwendbar(eingabe({ tilgungProzent: 1 }), VORGABE_ANNAHMEN).ok).toBe(
      false
    );
  });

  it("rechnet in Prozentpunkten, nicht in Euro", () => {
    expect(hebel("tilgung").schrittIstProzent).toBe(true);
  });
});

describe("Eigenleistung", () => {
  it("ist bei einem Bestandskauf nicht anwendbar", () => {
    expect(hebel("eigenleistung").anwendbar(eingabe(), VORGABE_ANNAHMEN).ok).toBe(false);
  });

  it("ist bei Modernisierung gedeckelt auf den Prozentsatz der Kosten", () => {
    const e = eingabe({ istNeubauOderModernisierung: true, modernisierungskosten: 100_000 });
    const a = hebel("eigenleistung").anwendbar(e, VORGABE_ANNAHMEN);
    expect(a.ok && a.max).toBe(15_000);
  });

  it("ist ohne erfasste Kosten nicht anwendbar, statt auf den Kaufpreis auszuweichen", () => {
    const e = eingabe({ istNeubauOderModernisierung: true, modernisierungskosten: 0 });
    expect(hebel("eigenleistung").anwendbar(e, VORGABE_ANNAHMEN).ok).toBe(false);
  });
});

describe("Inventar – der Hebel, der auch schaden kann", () => {
  it("senkt die Grunderwerbsteuer, hebt aber den Auslauf", () => {
    const e = eingabe();
    const vor = bewerte(e, VORGABE_ANNAHMEN);
    const nach = bewerte(hebel("inventar").anwenden(e, 20_000), VORGABE_ANNAHMEN);
    expect(nach.nebenkosten.grunderwerbsteuer).toBeLessThan(vor.nebenkosten.grunderwerbsteuer);
    expect(nach.auslauf).toBeGreaterThan(vor.auslauf);
  });

  it("sagt den Nachteil im Preis ausdruecklich", () => {
    expect(hebel("inventar").preis(eingabe(), 20_000)).toMatch(/Auslauf|Beleihungswert/);
  });
});

describe("Zusatzsicherheit", () => {
  it("senkt den Auslauf, ohne das Darlehen anzufassen", () => {
    const e = eingabe();
    const vor = bewerte(e, VORGABE_ANNAHMEN);
    const nach = bewerte(hebel("zusatzsicherheit").anwenden(e, 100_000), VORGABE_ANNAHMEN);
    expect(nach.darlehen).toBe(vor.darlehen);
    expect(nach.auslauf).toBeLessThan(vor.auslauf);
  });

  it("nennt im Preis die Rechnung fuer den freien Beleihungsraum", () => {
    expect(hebel("zusatzsicherheit").preis(eingabe(), 100_000)).toMatch(/Verkehrswert/);
  });
});

describe("Einnahmen erhoehen", () => {
  it("gibt es in zwei Auspraegungen", () => {
    expect(hebel("einnahmen")).toBeTruthy();
    expect(hebel("weiterer_darlehensnehmer")).toBeTruthy();
  });

  it("der weitere Darlehensnehmer bringt seine Lebenshaltung mit", () => {
    const e = eingabe();
    const nurGeld = bewerte(hebel("einnahmen").anwenden(e, 500), VORGABE_ANNAHMEN);
    const person = bewerte(hebel("weiterer_darlehensnehmer").anwenden(e, 500), VORGABE_ANNAHMEN);
    expect(person.ueberschuss).toBeLessThan(nurGeld.ueberschuss);
  });
});
