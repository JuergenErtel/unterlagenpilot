import { describe, it, expect } from "vitest";
import { ampelFuer } from "@/lib/machbarkeit/ampel";
import { VORGABE_ANNAHMEN } from "@/lib/machbarkeit/types";
import type { CanonicalCase } from "@/lib/domain/canonical";

const fall = (over: {
  kaufpreis?: number | undefined;
  eigenkapital?: number;
  netto?: number | undefined;
}): CanonicalCase =>
  ({
    applicants: [{ position: 1, vorname: "A", nachname: "B" }],
    employment: [],
    income: over.netto === undefined ? [] : [{ applicantPosition: 1, nettoMonatlich: over.netto }],
    liabilities: [],
    assets: [],
    property: { plz: "80331", ort: "München", wohnflaeche: 90 },
    financing:
      over.kaufpreis === undefined
        ? { eigenkapital: over.eigenkapital ?? 0 }
        : { kaufpreis: over.kaufpreis, eigenkapital: over.eigenkapital ?? 0 },
    platformIds: {},
  }) as unknown as CanonicalCase;

const opts = { applicantCount: 1, anzahlKinder: 0, verloren: false, abgeschlossen: false };

describe("Ampel – grün", () => {
  it("meldet grün, wenn der Fall bereits trägt", () => {
    const a = ampelFuer(
      fall({ kaufpreis: 400_000, eigenkapital: 150_000, netto: 5_000 }),
      opts,
      VORGABE_ANNAHMEN
    );
    expect(a!.farbe).toBe("gruen");
    expect(a!.text).toMatch(/trägt/);
    // Der Auslauf gehoert dazu – sonst ist "traegt" eine nackte Behauptung.
    expect(a!.text).toMatch(/%/);
  });
});

describe("Ampel – gelb", () => {
  it("nennt den fehlenden Eigenkapitalbetrag", () => {
    const a = ampelFuer(
      fall({ kaufpreis: 400_000, eigenkapital: 10_000, netto: 2_900 }),
      opts,
      VORGABE_ANNAHMEN
    );
    expect(a!.farbe).toBe("gelb");
    expect(a!.text).toMatch(/€/);
    expect(a!.text).toMatch(/EK|Eigenkapital/);
  });
});

describe("Ampel – rot", () => {
  it("meldet rot, wenn weder Eigenkapital noch ein kleineres Objekt helfen", () => {
    const a = ampelFuer(fall({ kaufpreis: 400_000, eigenkapital: 0, netto: 600 }), opts, VORGABE_ANNAHMEN);
    expect(a!.farbe).toBe("rot");
    expect(a!.text).toMatch(/nicht/);
  });
});

describe("Ampel – grau", () => {
  it("meldet grau bei fehlendem Kaufpreis, NIEMALS rot", () => {
    const a = ampelFuer(fall({ kaufpreis: undefined, netto: 3_000 }), opts, VORGABE_ANNAHMEN);
    expect(a!.farbe).toBe("grau");
    expect(a!.farbe).not.toBe("rot");
  });

  it("meldet grau bei fehlendem Einkommen und nennt im Grund, was fehlt", () => {
    const a = ampelFuer(fall({ kaufpreis: 400_000, netto: undefined }), opts, VORGABE_ANNAHMEN);
    expect(a!.farbe).toBe("grau");
    expect(a!.grund).toMatch(/Nettoeinkommen/);
  });
});

describe("Ampel – wo sie schweigt", () => {
  it("erscheint bei verlorenen Fällen gar nicht", () => {
    const a = ampelFuer(
      fall({ kaufpreis: 400_000, eigenkapital: 150_000, netto: 5_000 }),
      { ...opts, verloren: true },
      VORGABE_ANNAHMEN
    );
    expect(a).toBeNull();
  });

  it("erscheint bei abgeschlossenen Fällen gar nicht", () => {
    const a = ampelFuer(
      fall({ kaufpreis: 400_000, eigenkapital: 150_000, netto: 5_000 }),
      { ...opts, abgeschlossen: true },
      VORGABE_ANNAHMEN
    );
    expect(a).toBeNull();
  });
});

describe("Ampel – Begründung", () => {
  it("trägt immer einen Grund, der mehr sagt als der Kurztext", () => {
    for (const f of [
      fall({ kaufpreis: 400_000, eigenkapital: 150_000, netto: 5_000 }),
      fall({ kaufpreis: 400_000, eigenkapital: 10_000, netto: 2_900 }),
      fall({ kaufpreis: 400_000, eigenkapital: 0, netto: 600 }),
    ]) {
      const a = ampelFuer(f, opts, VORGABE_ANNAHMEN)!;
      expect(a.grund.length).toBeGreaterThan(a.text.length);
    }
  });
});
