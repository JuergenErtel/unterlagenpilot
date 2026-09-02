import { describe, it, expect } from "vitest";
import { berechneKontingent, vorperiode, verbrauchsSchluessel, type KontingentEreignisRoh } from "@/lib/backoffice/kontingent";

/**
 * Das Kontingent ist eine reine Rechnung ueber Ereignisse. Verbrauch entsteht
 * nur bei der Uebergabe, Korrekturen sind eigene Ereignisse mit Vorzeichen.
 */

const PERIODE = "2026-09";

function verbrauch(n: number, periode = PERIODE): KontingentEreignisRoh[] {
  return Array.from({ length: n }, () => ({ art: "verbrauch" as const, menge: 1, periode }));
}

function abo(ereignisse: KontingentEreignisRoh[], over: Partial<Parameters<typeof berechneKontingent>[0]> = {}) {
  return berechneKontingent({
    periode: PERIODE,
    modell: "abo",
    kontingentMonatlich: 10,
    carryOverMax: 0,
    ereignisse,
    ...over,
  });
}

describe("berechneKontingent – Abo mit Kontingent", () => {
  it("zieht vier Verbräuche von zehn enthaltenen Fällen ab", () => {
    const s = abo(verbrauch(4));
    expect(s.enthalten).toBe(10);
    expect(s.verbraucht).toBe(4);
    expect(s.frei).toBe(6);
    expect(s.ueberzogen).toBe(0);
  });

  it("gibt mit einer Korrektur von minus eins einen Fall zurück", () => {
    const s = abo([...verbrauch(4), { art: "korrektur", menge: -1, periode: PERIODE }]);
    expect(s.verbraucht).toBe(3);
    expect(s.frei).toBe(7);
  });

  it("weist einen Überzug aus, wenn mehr verbraucht als enthalten ist", () => {
    const s = abo(verbrauch(12));
    expect(s.frei).toBe(0);
    expect(s.ueberzogen).toBe(2);
  });

  it("zählt Zusatzfälle getrennt und nicht gegen das Kontingent", () => {
    const s = abo([...verbrauch(2), { art: "zusatzfall", menge: 1, periode: PERIODE }]);
    expect(s.zusatzfaelle).toBe(1);
    expect(s.verbraucht).toBe(2);
    expect(s.frei).toBe(8);
  });

  it("lässt den Verbrauch nie unter null fallen, auch bei überschießender Korrektur", () => {
    const s = abo([{ art: "korrektur", menge: -5, periode: PERIODE }]);
    expect(s.verbraucht).toBe(0);
    expect(s.frei).toBe(10);
  });
});

describe("berechneKontingent – Übertrag aus der Vorperiode", () => {
  it("nimmt ungenutzte Fälle aus der Vorperiode mit, gedeckelt durch carryOverMax", () => {
    // Vorperiode: 10 enthalten, 3 verbraucht → 7 frei, aber Deckel 2.
    const s = abo(verbrauch(3, "2026-08"), { carryOverMax: 2 });
    expect(s.uebertrag).toBe(2);
    expect(s.frei).toBe(12);
  });

  it("überträgt nur, was in der Vorperiode tatsächlich frei blieb", () => {
    const s = abo(verbrauch(9, "2026-08"), { carryOverMax: 5 });
    expect(s.uebertrag).toBe(1);
  });

  it("überträgt nichts, wenn die Vorperiode ausgeschöpft war", () => {
    const s = abo(verbrauch(10, "2026-08"), { carryOverMax: 5 });
    expect(s.uebertrag).toBe(0);
  });

  it("überträgt ohne carryOverMax nichts", () => {
    const s = abo(verbrauch(0, "2026-08"), { carryOverMax: 0 });
    expect(s.uebertrag).toBe(0);
    expect(s.frei).toBe(10);
  });

  it("stapelt keinen Übertrag über mehrere Monate", () => {
    // Juli komplett frei, August komplett frei – nur der August zaehlt.
    const s = abo([], { carryOverMax: 3 });
    expect(s.uebertrag).toBe(3);
    expect(s.frei).toBe(13);
  });
});

describe("berechneKontingent – Modelle ohne Kontingent", () => {
  it("liefert beim Testfall kein Kontingent und keinen Freibetrag", () => {
    const s = berechneKontingent({ periode: PERIODE, modell: "testfall", kontingentMonatlich: 10, carryOverMax: 5, ereignisse: verbrauch(1) });
    expect(s.enthalten).toBeNull();
    expect(s.frei).toBeNull();
    expect(s.uebertrag).toBe(0);
    expect(s.ueberzogen).toBe(0);
    expect(s.verbraucht).toBe(1);
  });

  it("liefert beim Abo ohne vereinbartes Kontingent ebenfalls null", () => {
    const s = abo(verbrauch(3), { kontingentMonatlich: null });
    expect(s.enthalten).toBeNull();
    expect(s.frei).toBeNull();
    expect(s.verbraucht).toBe(3);
  });
});

describe("berechneKontingent – Periodenabgrenzung", () => {
  it("zählt Ereignisse fremder Perioden nicht", () => {
    const s = abo([...verbrauch(2), ...verbrauch(5, "2026-07"), ...verbrauch(4, "2026-10")]);
    expect(s.verbraucht).toBe(2);
    expect(s.frei).toBe(8);
  });

  it("trägt die angefragte Periode und das Modell im Ergebnis", () => {
    const s = abo([]);
    expect(s.periode).toBe(PERIODE);
    expect(s.modell).toBe("abo");
  });
});

describe("vorperiode", () => {
  it("geht vom Januar in den Dezember des Vorjahres", () => {
    expect(vorperiode("2026-01")).toBe("2025-12");
  });

  it("geht innerhalb des Jahres einen Monat zurück", () => {
    expect(vorperiode("2026-09")).toBe("2026-08");
    expect(vorperiode("2026-10")).toBe("2026-09");
  });

  it("gibt eine unlesbare Periode unverändert zurück", () => {
    expect(vorperiode("quatsch")).toBe("quatsch");
  });
});

describe("verbrauchsSchluessel", () => {
  it("ist je Auftrag eindeutig und stabil", () => {
    expect(verbrauchsSchluessel("a-1")).toBe("verbrauch:a-1");
    expect(verbrauchsSchluessel("a-1")).toBe(verbrauchsSchluessel("a-1"));
    expect(verbrauchsSchluessel("a-1")).not.toBe(verbrauchsSchluessel("a-2"));
  });
});
