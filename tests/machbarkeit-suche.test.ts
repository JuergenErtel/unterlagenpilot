import { describe, it, expect } from "vitest";
import { kleinsterWert, aufHundert } from "@/lib/machbarkeit/suche";
import { HEBEL } from "@/lib/machbarkeit/hebel";
import { bewerte } from "@/lib/machbarkeit/bewertung";
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
  // Bewusst knapp: mit 10.000 € Eigenkapital liegt der Auslauf bei 103 %, und
  // der Haushalt traegt die daraus folgende Rate nicht. Genau der Fall, den der
  // Solver retten soll.
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

const machbar = (u: { machbar: boolean }) => u.machbar;
const hebel = (k: string) => HEBEL.find((h) => h.key === k)!;

describe("Aufrundung", () => {
  it("rundet immer auf volle 100 Euro AUF", () => {
    expect(aufHundert(14_437)).toBe(14_500);
    expect(aufHundert(14_400)).toBe(14_400);
    expect(aufHundert(0.5)).toBe(100);
    expect(aufHundert(0)).toBe(0);
  });
});

describe("kleinsterWert", () => {
  it("findet den kleinsten Eigenkapitalbetrag, der den Fall kippt", () => {
    const e = eingabe();
    expect(bewerte(e, VORGABE_ANNAHMEN).machbar).toBe(false);

    const t = kleinsterWert(hebel("eigenkapital"), e, VORGABE_ANNAHMEN, machbar);
    expect(t).not.toBeNull();
    expect(t!.urteil.machbar).toBe(true);

    // Ein Hunderter weniger darf NICHT reichen – sonst ist es nicht der kleinste.
    const knapp = bewerte(hebel("eigenkapital").anwenden(e, t!.wert - 100), VORGABE_ANNAHMEN);
    expect(knapp.machbar).toBe(false);
  });

  it("liefert einen auf 100 aufgerundeten Betrag", () => {
    const t = kleinsterWert(hebel("eigenkapital"), eingabe(), VORGABE_ANNAHMEN, machbar);
    expect(t!.wert % 100).toBe(0);
  });

  it("rundet den Tilgungshebel NICHT auf 100 – das sind Prozentpunkte", () => {
    const e = eingabe({ eigenkapital: 90_000, nettoEinkommen: 2_450 });
    const t = kleinsterWert(hebel("tilgung"), e, VORGABE_ANNAHMEN, machbar);
    if (t) expect(t.wert).toBeLessThanOrEqual(1);
  });

  it("liefert null, wenn auch der Maximalwert nicht reicht", () => {
    const e = eingabe({ nettoEinkommen: 600 });
    expect(kleinsterWert(hebel("eigenkapital"), e, VORGABE_ANNAHMEN, machbar)).toBeNull();
  });

  it("liefert null, wenn der Hebel nicht anwendbar ist", () => {
    expect(kleinsterWert(hebel("eigenleistung"), eingabe(), VORGABE_ANNAHMEN, machbar)).toBeNull();
  });

  it("findet bei diskreten Hebeln die guenstigste Teilmenge", () => {
    const e = eingabe({
      eigenkapital: 90_000,
      nettoEinkommen: 3_000,
      kredite: [
        { id: "k1", bezeichnung: "Autokredit", restschuld: 8_900, rate: 312 },
        { id: "k2", bezeichnung: "Ratenkauf", restschuld: 1_200, rate: 60 },
      ],
      bestehendeRaten: 372,
    });
    const t = kleinsterWert(hebel("konsumkredit"), e, VORGABE_ANNAHMEN, machbar);
    expect(t).not.toBeNull();
    expect(t!.urteil.machbar).toBe(true);
  });

  it("bricht bei einem nicht monotonen Hebel nicht vorzeitig ab", () => {
    // Inventar kann schaden; die Rastersuche darf nicht aufhoeren, sobald ein
    // Wert das Ergebnis verschlechtert.
    const e = eingabe({ eigenkapital: 60_000, nettoEinkommen: 4_200 });
    const t = kleinsterWert(hebel("inventar"), e, VORGABE_ANNAHMEN, machbar);
    if (t) expect(t.urteil.machbar).toBe(true);
  });

  it("gibt bei einem bereits machbaren Fall den Wert 0 zurueck", () => {
    const e = eingabe({ eigenkapital: 150_000 });
    const t = kleinsterWert(hebel("eigenkapital"), e, VORGABE_ANNAHMEN, machbar);
    expect(t?.wert).toBe(0);
  });

  it("liefert nie ein Ergebnis, das das Ziel verfehlt", () => {
    for (const h of HEBEL) {
      const t = kleinsterWert(h, eingabe(), VORGABE_ANNAHMEN, machbar);
      if (t) expect(t.urteil.machbar, h.key).toBe(true);
    }
  });
});
