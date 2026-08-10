import { describe, it, expect } from "vitest";
import { loese } from "@/lib/machbarkeit/solver";
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
  eigenkapital: 10_000,
  eigenleistung: 0,
  zusatzsicherheitBeleihungsraum: 0,
  ratenkreditAnteil: 0,
  tilgungProzent: 2,
  sollzinsProzent: null,
  nettoEinkommen: 2_900,
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

describe("Diagnose", () => {
  it("benennt den Haushalt als Ursache, wenn nur er reisst", () => {
    const r = loese(
      eingabe({ eigenkapital: 150_000, nettoEinkommen: 1_500 }),
      VORGABE_ANNAHMEN,
      false
    );
    expect(r.modus).toBe("rettung");
    expect(r.diagnose).toMatch(/Haushalt/);
  });

  it("benennt den Auslauf als Ursache, wenn nur er reisst", () => {
    const r = loese(
      eingabe({ eigenkapital: 0, maklerprovisionProzent: 7, nettoEinkommen: 25_000 }),
      VORGABE_ANNAHMEN,
      false
    );
    expect(r.diagnose).toMatch(/Beleihungsauslauf/);
  });

  it("wechselt bei tragfaehigen Faellen in den Optimierungsmodus", () => {
    const r = loese(eingabe({ eigenkapital: 150_000 }), VORGABE_ANNAHMEN, false);
    expect(r.modus).toBe("optimierung");
    expect(r.diagnose).toMatch(/trägt/);
  });
});

describe("Hebelliste", () => {
  it("listet alle Hebel, auch die nicht anwendbaren", () => {
    const r = loese(eingabe(), VORGABE_ANNAHMEN, false);
    expect(r.hebel).toHaveLength(10);
  });

  it("begruendet, warum ein Hebel nicht anwendbar ist", () => {
    const r = loese(eingabe(), VORGABE_ANNAHMEN, false);
    const el = r.hebel.find((h) => h.key === "eigenleistung")!;
    expect(el.anwendbar).toBe(false);
    expect(el.grund).toMatch(/Neubau|Modernisierung/);
  });

  it("nennt bei einem wirksamen Hebel Wert, Preis und Wirkung", () => {
    const r = loese(eingabe(), VORGABE_ANNAHMEN, false);
    const ek = r.hebel.find((h) => h.key === "eigenkapital")!;
    expect(ek.reichtAllein).toBe(true);
    expect(ek.wertText).toMatch(/€/);
    expect(ek.preis).toBeTruthy();
    expect(ek.nachher!.machbar).toBe(true);
  });

  it("haelt fest, wenn ein Hebel auch am Maximum nicht reicht", () => {
    const r = loese(eingabe({ nettoEinkommen: 600 }), VORGABE_ANNAHMEN, false);
    const ek = r.hebel.find((h) => h.key === "eigenkapital")!;
    expect(ek.anwendbar).toBe(true);
    expect(ek.reichtAllein).toBe(false);
    expect(ek.grund).toMatch(/löst es nicht/i);
  });

  it("stellt datengestuetzte Treffer vor hypothetische", () => {
    const r = loese(
      eingabe({
        nettoEinkommen: 3_000,
        eigenkapital: 90_000,
        kredite: [{ id: "k1", bezeichnung: "Autokredit", restschuld: 8_900, rate: 312 }],
        bestehendeRaten: 312,
      }),
      VORGABE_ANNAHMEN,
      false
    );
    const treffer = r.hebel.filter((h) => h.reichtAllein);
    const letzteDaten = treffer.map((h) => h.sorte).lastIndexOf("datengestuetzt");
    const ersteHypothetisch = treffer.findIndex((h) => h.sorte === "hypothetisch");
    if (letzteDaten >= 0 && ersteHypothetisch >= 0) {
      expect(letzteDaten).toBeLessThan(ersteHypothetisch);
    }
  });
});

describe("Paare", () => {
  it("sucht keine Paare, wenn schon ein einzelner Hebel reicht", () => {
    expect(loese(eingabe(), VORGABE_ANNAHMEN, false).paare).toHaveLength(0);
  });

  it("liefert nur Paare, die das Ziel wirklich erreichen", () => {
    const r = loese(eingabe({ nettoEinkommen: 2_100, eigenkapital: 20_000 }), VORGABE_ANNAHMEN, false);
    for (const p of r.paare) expect(p.nachher.machbar).toBe(true);
  });
});

describe("Bandbreite der Zinsannahme", () => {
  it("nennt zu einem wirksamen Hebel auch guenstiges und unguenstiges Ergebnis", () => {
    const r = loese(eingabe(), VORGABE_ANNAHMEN, false);
    const mitSpanne = r.hebel.filter((h) => h.reichtAllein && h.spanne);
    expect(mitSpanne.length).toBeGreaterThan(0);
    for (const h of mitSpanne) {
      expect(h.spanne!.guenstig).toBeTruthy();
      expect(h.spanne!.unguenstig).toBeTruthy();
    }
  });

  it("laesst die Bandbreite weg, wo der Zinsaufschlag nichts bewegt", () => {
    // Reiner Auslauf-Fall bei sehr hohem Einkommen: der Haushalt traegt immer,
    // der Aufschlag ist damit ohne Wirkung auf das Ergebnis.
    const r = loese(
      eingabe({ eigenkapital: 0, maklerprovisionProzent: 7, nettoEinkommen: 25_000 }),
      VORGABE_ANNAHMEN,
      false
    );
    const ek = r.hebel.find((h) => h.key === "eigenkapital");
    if (ek?.reichtAllein) expect(ek.spanne).toBeUndefined();
  });
});

describe("Transparenz", () => {
  it("gibt die verwendeten Annahmen und Nebenkosten mit aus", () => {
    const r = loese(eingabe(), VORGABE_ANNAHMEN, false);
    expect(r.annahmen.basiszinsProzent).toBe(VORGABE_ANNAHMEN.basiszinsProzent);
    expect(r.nebenkosten.grunderwerbsteuer).toBeGreaterThan(0);
  });

  it("reicht die Unsicherheit beim Bundesland durch", () => {
    expect(loese(eingabe(), VORGABE_ANNAHMEN, true).bundeslandUnsicher).toBe(true);
  });
});
