import { describe, it, expect } from "vitest";
import { activeLeads, filterLeads, type LeadRowData } from "@/components/finlink/finlink-lead-list";

const leads: LeadRowData[] = [
  { id: "a", name: "Lahwani Mohammad", ort: "Karlsruhe", objektOrt: "Wörth am Rhein", finanzierungsart: "kauf" },
  {
    id: "b",
    name: "Kimi Fröhlich",
    ort: "Berlin",
    finanzierungsart: "neubau",
    importedCase: { id: "c1", caseNumber: "UP-2026-0002" },
  },
  { id: "c", name: "Max Muster" },
];

describe("filterLeads", () => {
  it("leerer Query liefert alle Leads", () => {
    expect(filterLeads(leads, "")).toHaveLength(3);
    expect(filterLeads(leads, "   ")).toHaveLength(3);
  });

  it("findet nach Name, unabhängig von Groß-/Kleinschreibung", () => {
    expect(filterLeads(leads, "lahwani").map((l) => l.id)).toEqual(["a"]);
    expect(filterLeads(leads, "FRÖHLICH").map((l) => l.id)).toEqual(["b"]);
  });

  it("findet nach Ort und Objektort", () => {
    expect(filterLeads(leads, "berlin").map((l) => l.id)).toEqual(["b"]);
    expect(filterLeads(leads, "wörth").map((l) => l.id)).toEqual(["a"]);
  });

  it("findet nach Finanzierungsart (deutsches Label)", () => {
    expect(filterLeads(leads, "kauf").map((l) => l.id)).toEqual(["a"]);
    expect(filterLeads(leads, "neubau").map((l) => l.id)).toEqual(["b"]);
  });

  it("findet nach Fallnummer bereits importierter Leads", () => {
    expect(filterLeads(leads, "UP-2026-0002").map((l) => l.id)).toEqual(["b"]);
  });

  it("mehrere Suchwörter müssen alle treffen (UND)", () => {
    expect(filterLeads(leads, "mohammad karlsruhe").map((l) => l.id)).toEqual(["a"]);
    expect(filterLeads(leads, "mohammad berlin")).toHaveLength(0);
  });

  it("ohne Treffer kommt eine leere Liste", () => {
    expect(filterLeads(leads, "gibtsnicht")).toHaveLength(0);
  });
});

describe("activeLeads", () => {
  it("behält nur Leads mit sales_state active – ohne Status gilt als inaktiv", () => {
    const mix: LeadRowData[] = [
      { id: "a", name: "A", salesState: "active" },
      { id: "b", name: "B", salesState: "lost" },
      { id: "c", name: "C", salesState: "won" },
      { id: "d", name: "D", salesState: "on_hold" },
      { id: "e", name: "E" },
    ];
    expect(activeLeads(mix).map((l) => l.id)).toEqual(["a"]);
  });
});
