import { describe, it, expect } from "vitest";
import { consolidateEinkommen, trendFor, type EinkommenDoc } from "@/lib/einkommen/consolidate";

describe("Einkommens-Konsolidierung", () => {
  it("trendFor: steigend/fallend/stabil/unbekannt", () => {
    expect(trendFor([100, 120])).toBe("steigend");
    expect(trendFor([120, 90])).toBe("fallend");
    expect(trendFor([100, 102])).toBe("stabil");
    expect(trendFor([100])).toBe("unbekannt");
    expect(trendFor([])).toBe("unbekannt");
  });

  it("baut eine Jahr×Kennzahl-Matrix, Jahre aufsteigend", () => {
    const docs: EinkommenDoc[] = [
      { dokumenttyp: "euer", jahr: 2023, kennzahlen: { umsatz: 200000, gewinn: 80000 }, notiz: "", konfidenz: 0.9 },
      { dokumenttyp: "euer", jahr: 2022, kennzahlen: { umsatz: 180000, gewinn: 70000 }, notiz: "", konfidenz: 0.9 },
    ];
    const m = consolidateEinkommen(docs);
    expect(m.jahre).toEqual([2022, 2023]);
    const gewinn = m.rows.find((r) => r.kennzahl === "gewinn")!;
    expect(gewinn.cells[2022]!.value).toBe(70000);
    expect(gewinn.cells[2023]!.value).toBe(80000);
    expect(gewinn.trend).toBe("steigend");
  });

  it("markiert Konflikte zwischen Dokumenten desselben Jahres", () => {
    const docs: EinkommenDoc[] = [
      { dokumenttyp: "euer", jahr: 2023, kennzahlen: { gewinn: 80000 }, notiz: "", konfidenz: 0.9 },
      { dokumenttyp: "einkommensteuerbescheid", jahr: 2023, kennzahlen: { gewinn: 75000 }, notiz: "", konfidenz: 0.8 },
    ];
    const m = consolidateEinkommen(docs);
    const gewinn = m.rows.find((r) => r.kennzahl === "gewinn")!;
    expect(gewinn.cells[2023]!.conflict).toBe(true);
    expect(gewinn.cells[2023]!.alle.sort()).toEqual([75000, 80000]);
  });

  it("nimmt nur Kennzahlen mit mindestens einem Wert in die Matrix auf", () => {
    const docs: EinkommenDoc[] = [
      { dokumenttyp: "euer", jahr: 2023, kennzahlen: { umsatz: 100000 }, notiz: "", konfidenz: 0.9 },
    ];
    const m = consolidateEinkommen(docs);
    expect(m.rows.some((r) => r.kennzahl === "umsatz")).toBe(true);
    expect(m.rows.some((r) => r.kennzahl === "afa")).toBe(false);
  });
});
