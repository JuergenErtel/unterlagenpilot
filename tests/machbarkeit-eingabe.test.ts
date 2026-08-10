import { describe, it, expect } from "vitest";
import { baueEingabe } from "@/lib/machbarkeit/eingabe";
import type { CanonicalCase } from "@/lib/domain/canonical";

const basis = (over: Partial<CanonicalCase> = {}): CanonicalCase =>
  ({
    applicants: [{ position: 1, vorname: "A", nachname: "B" }],
    employment: [],
    income: [{ applicantPosition: 1, nettoMonatlich: 3_500 }],
    liabilities: [],
    assets: [],
    property: { plz: "80331", ort: "München", wohnflaeche: 90 },
    financing: { kaufpreis: 400_000, eigenkapital: 60_000 },
    platformIds: {},
    ...over,
  }) as unknown as CanonicalCase;

const opts = { applicantCount: 1, anzahlKinder: 0 };

describe("Eingabe-Aufbereitung", () => {
  it("baut eine vollstaendige Eingabe", () => {
    const r = baueEingabe(basis(), opts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.eingabe.kaufpreis).toBe(400_000);
      expect(r.eingabe.nettoEinkommen).toBe(3_500);
      expect(r.eingabe.bundesland).toBe("bayern");
      expect(r.bundeslandUnsicher).toBe(false);
    }
  });

  it("verweigert die Rechnung ohne Kaufpreis – keine stillen Nullen", () => {
    const r = baueEingabe(basis({ financing: { eigenkapital: 60_000 } as never }), opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehlend.join(" ")).toMatch(/Kaufpreis/);
  });

  it("verweigert die Rechnung ohne Nettoeinkommen", () => {
    const r = baueEingabe(basis({ income: [] }), opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehlend.join(" ")).toMatch(/Nettoeinkommen/);
  });

  it("nennt mehrere fehlende Angaben auf einmal", () => {
    const r = baueEingabe(basis({ income: [], financing: {} as never }), opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehlend.length).toBeGreaterThanOrEqual(2);
  });

  it("nimmt Baukosten, wenn kein Kaufpreis erfasst ist", () => {
    const r = baueEingabe(basis({ financing: { baukosten: 350_000 } as never }), opts);
    expect(r.ok && r.eingabe.kaufpreis).toBe(350_000);
  });

  it("behandelt fehlendes Eigenkapital als null Euro, nicht als fehlende Angabe", () => {
    const r = baueEingabe(basis({ financing: { kaufpreis: 400_000 } as never }), opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.eingabe.eigenkapital).toBe(0);
  });

  it("uebernimmt laufende Kredite mit Rate als Hebelkandidaten", () => {
    const r = baueEingabe(
      basis({
        liabilities: [
          { art: "Autokredit", restschuld: 8_900, monatlicheRate: 312, abzuloesen: false },
          { art: "Ohne Rate", restschuld: 500, abzuloesen: false },
        ] as never,
      }),
      opts
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.eingabe.kredite).toHaveLength(1);
      expect(r.eingabe.bestehendeRaten).toBe(312);
    }
  });

  it("zaehlt bereits als abzuloesen markierte Kredite zur Restschuld", () => {
    const r = baueEingabe(
      basis({
        liabilities: [
          { art: "Altdarlehen", restschuld: 20_000, monatlicheRate: 200, abzuloesen: true },
        ] as never,
      }),
      opts
    );
    expect(r.ok && r.eingabe.abzuloesendeRestschuld).toBe(20_000);
    // Ein abzuloesender Kredit ist kein Hebelkandidat mehr.
    expect(r.ok && r.eingabe.kredite).toHaveLength(0);
  });

  it("erkennt Neubau und Modernisierung fuer den Eigenleistungs-Hebel", () => {
    expect(
      baueEingabe(basis({ financingType: "neubau" } as never), opts).ok &&
        baueEingabe(basis({ financingType: "neubau" } as never), opts)
    ).toBeTruthy();
    const r = baueEingabe(basis({ financingType: "modernisierung" } as never), opts);
    expect(r.ok && r.eingabe.istNeubauOderModernisierung).toBe(true);
  });

  it("meldet ein unsicheres Bundesland weiter", () => {
    const r = baueEingabe(basis({ property: { plz: "65391", ort: "Irgendwo" } as never }), opts);
    expect(r.ok && r.bundeslandUnsicher).toBe(true);
  });

  it("laesst ein manuell gesetztes Bundesland gewinnen", () => {
    const r = baueEingabe(basis(), { ...opts, bundeslandOverride: "hamburg" });
    expect(r.ok && r.eingabe.bundesland).toBe("hamburg");
    expect(r.ok && r.bundeslandUnsicher).toBe(false);
  });
});
