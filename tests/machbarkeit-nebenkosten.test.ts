import { describe, it, expect } from "vitest";
import { berechneNebenkosten } from "@/lib/machbarkeit/nebenkosten";
import { VORGABE_ANNAHMEN } from "@/lib/machbarkeit/types";
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
  maklerprovisionProzent: 3.57,
  bundesland: "bayern",
  grunderwerbsteuerProzentOverride: null,
  eigenkapital: 80_000,
  eigenleistung: 0,
  zusatzsicherheitBeleihungsraum: 0,
  ratenkreditAnteil: 0,
  tilgungProzent: 2,
  sollzinsProzent: null,
  wunschrateMonatlich: null,
  nettoEinkommen: 4_000,
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

describe("Nebenkosten", () => {
  it("rechnet Grunderwerbsteuer, Notar und Makler aus dem Kaufpreis", () => {
    const n = berechneNebenkosten(eingabe(), VORGABE_ANNAHMEN);
    expect(n.grunderwerbsteuer).toBe(14_000); // Bayern 3,5 % von 400.000
    expect(n.notarGrundbuch).toBe(8_000); // 2 % von 400.000
    expect(n.makler).toBe(14_280); // 3,57 % von 400.000
    expect(n.summe).toBe(36_280);
    expect(n.gerechnet).toBe(true);
  });

  it("nimmt einen erfassten Nebenkostenbetrag statt zu rechnen – nie beides", () => {
    const n = berechneNebenkosten(eingabe({ nebenkostenErfasst: 30_000 }), VORGABE_ANNAHMEN);
    expect(n.summe).toBe(30_000);
    expect(n.gerechnet).toBe(false);
  });

  it("zieht herausgerechnetes Inventar von der Grunderwerbsteuer ab", () => {
    const n = berechneNebenkosten(eingabe({ inventarAnteil: 20_000 }), VORGABE_ANNAHMEN);
    expect(n.grunderwerbsteuer).toBe(13_300); // 3,5 % von 380.000
  });

  it("respektiert einen manuell gesetzten Steuersatz", () => {
    const n = berechneNebenkosten(
      eingabe({ grunderwerbsteuerProzentOverride: 6.5 }),
      VORGABE_ANNAHMEN
    );
    expect(n.grunderwerbsteuer).toBe(26_000);
    expect(n.steuersatzUnsicher).toBe(false);
  });

  it("rechnet ohne Makler, wenn keine Provision erfasst ist", () => {
    const n = berechneNebenkosten(eingabe({ maklerprovisionProzent: 0 }), VORGABE_ANNAHMEN);
    expect(n.makler).toBe(0);
  });

  it("nutzt bei unbekanntem Bundesland den vorsichtigsten Satz", () => {
    const n = berechneNebenkosten(eingabe({ bundesland: null }), VORGABE_ANNAHMEN);
    // 6,5 % – lieber zu teuer rechnen als eine Machbarkeit vorgaukeln.
    expect(n.grunderwerbsteuer).toBe(26_000);
    expect(n.steuersatzUnsicher).toBe(true);
  });

  it("gibt den verwendeten Steuersatz mit aus", () => {
    const n = berechneNebenkosten(eingabe({ bundesland: "nordrhein_westfalen" }), VORGABE_ANNAHMEN);
    expect(n.grunderwerbsteuerProzent).toBe(6.5);
  });
});

describe("Nebenkosten ohne Kaufpreis", () => {
  it("meldet den Steuersatz nicht als unsicher, wo gar keine Steuer anfaellt", () => {
    // Bei Modernisierung, Anschlussfinanzierung und Kapitalbeschaffung gibt es
    // keinen Kaufpreis und damit keine Grunderwerbsteuer. Die Maske haenge
    // sonst eine Warnung ueber einen Satz an, der nirgends angewendet wird –
    // und fordert zu einer Angabe auf, die nichts aendert.
    const n = berechneNebenkosten(eingabe({ kaufpreis: 0, bundesland: null }), VORGABE_ANNAHMEN);
    expect(n.summe).toBe(0);
    expect(n.steuersatzUnsicher).toBe(false);
  });

  it("meldet ihn weiterhin als unsicher, sobald ein Kaufpreis daran haengt", () => {
    const n = berechneNebenkosten(
      eingabe({ kaufpreis: 400_000, bundesland: null }),
      VORGABE_ANNAHMEN
    );
    expect(n.steuersatzUnsicher).toBe(true);
  });
});
