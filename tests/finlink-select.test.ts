import { describe, it, expect } from "vitest";
import { waehleNeueLeads } from "@/lib/platforms/finlink/select";
import type { FinLinkLeadRoh } from "@/lib/platforms/finlink/dto";

function lead(id: string, createdAt: string | null): FinLinkLeadRoh {
  return {
    id,
    // Die Auswahl bekommt nur, was der Client schon gefiltert hat – hier steht
    // deshalb immer der eigene Berater.
    beraterId: "advisor-test-1",
    createdAt,
    sourceType: null,
    source: null,
    einwilligungKontakt: null,
    einwilligungMarketing: null,
  };
}

const marke = new Date("2026-08-07T10:00:00Z");

describe("waehleNeueLeads", () => {
  it("nimmt nur Leads, die neuer als die Marke sind", () => {
    const gewaehlt = waehleNeueLeads(
      [lead("neu", "2026-08-07T11:00:00Z"), lead("alt", "2026-08-07T09:00:00Z")],
      marke,
      200
    );
    expect(gewaehlt.map((l) => l.id)).toEqual(["neu"]);
  });

  it("nimmt einen Lead mit exakt der Marke NICHT erneut", () => {
    expect(waehleNeueLeads([lead("gleich", "2026-08-07T10:00:00Z")], marke, 200)).toEqual([]);
  });

  it("nimmt ohne Marke nichts – der erste Lauf holt keinen Bestand nach", () => {
    expect(waehleNeueLeads([lead("a", "2026-08-01T10:00:00Z")], null, 200)).toEqual([]);
  });

  it("überspringt Leads ohne Eingangszeitpunkt", () => {
    // Ohne Zeitstempel ist nicht entscheidbar, ob der Lead neu ist – ihn
    // mitzunehmen würde bei jedem Lauf denselben Fall erzeugen wollen.
    expect(waehleNeueLeads([lead("ohne", null)], marke, 200)).toEqual([]);
  });

  it("deckelt die Menge und nimmt dabei die ältesten zuerst", () => {
    // Stunden 11–15, alle nach der Marke von 10:00.
    const viele = Array.from({ length: 5 }, (_, i) => lead(`l${i}`, `2026-08-07T1${i + 1}:00:00Z`));
    const gewaehlt = waehleNeueLeads(viele, marke, 3);
    // Älteste zuerst, damit die Marke lückenlos vorrückt.
    expect(gewaehlt.map((l) => l.id)).toEqual(["l0", "l1", "l2"]);
  });

  it("verkraftet einen unlesbaren Zeitstempel", () => {
    expect(waehleNeueLeads([lead("kaputt", "morgen frueh")], marke, 200)).toEqual([]);
  });
});
