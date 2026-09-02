import { describe, it, expect } from "vitest";
import { fokusAuftrag, naechsteHandlung } from "@/lib/backoffice/fokus";
import type { AuftragFuerKennzahlen } from "@/lib/backoffice/kennzahlen";

const jetzt = new Date("2026-09-02T10:00:00+02:00");
function auftrag(over: Partial<AuftragFuerKennzahlen> = {}): AuftragFuerKennzahlen {
  return {
    id: "a",
    status: "in_aufbereitung",
    prioritaet: "normal",
    eingangAm: new Date("2026-09-01T09:00:00+02:00"),
    faelligAm: new Date("2026-09-05T17:00:00+02:00"),
    pausiertSeit: null,
    bearbeiterId: null,
    bearbeiterName: null,
    uebergebenAm: null,
    updatedAt: jetzt,
    fehlendeUnterlagen: 0,
    ungepruefteDokumente: 0,
    offeneRueckfragen: 0,
    beantworteteRueckfragen: 0,
    ...over,
  };
}

describe("naechsteHandlung", () => {
  it("nennt in der Aufbereitung zuerst die ungeprueften Dokumente", () => {
    const h = naechsteHandlung(auftrag({ ungepruefteDokumente: 3, fehlendeUnterlagen: 2 }));
    expect(h.text).toBe("3 Dokumente prüfen");
    expect(h.ziel).toBe("unterlagen");
    expect(h.wartet).toBe(false);
  });

  it("nennt danach die fehlenden Unterlagen, zuletzt die Qualitaetskontrolle", () => {
    expect(naechsteHandlung(auftrag({ fehlendeUnterlagen: 1 })).text).toBe("1 fehlende Unterlage anfordern");
    expect(naechsteHandlung(auftrag()).text).toBe("Qualitätskontrolle anfordern");
  });

  it("markiert Wartezustaende als Warten und nennt den Blocker", () => {
    const h = naechsteHandlung(auftrag({ status: "wartet_auf_unterlagen", fehlendeUnterlagen: 4 }));
    expect(h.wartet).toBe(true);
    expect(h.blocker).toBe("4 fehlende Unterlagen");
    const r = naechsteHandlung(auftrag({ status: "rueckfrage_auftraggeber", offeneRueckfragen: 1 }));
    expect(r.wartet).toBe(true);
  });

  it("macht aus einer eingegangenen Rueckmeldung wieder eine Aufgabe", () => {
    const h = naechsteHandlung(auftrag({ status: "rueckfrage_auftraggeber", beantworteteRueckfragen: 1 }));
    expect(h.wartet).toBe(false);
  });

  it("pausiert schlaegt alles", () => {
    const h = naechsteHandlung(auftrag({ status: "qualitaetskontrolle", pausiertSeit: jetzt }));
    expect(h.wartet).toBe(true);
    expect(h.blocker).toBe("Pausiert");
  });

  it("kennt fuer jeden Status einen Satz", () => {
    for (const s of ["neu_eingegangen", "auftrag_pruefen", "qualitaetskontrolle", "einreichungsfertig", "uebergeben", "abgeschlossen", "nachbearbeitung", "abgelehnt", "storniert"] as const) {
      expect(naechsteHandlung(auftrag({ status: s })).text.length).toBeGreaterThan(3);
    }
  });
});

describe("fokusAuftrag", () => {
  it("nimmt den ueberfaelligen vor dem dringenden vor dem naechsten", () => {
    const ueberfaellig = auftrag({ id: "u", faelligAm: new Date("2026-09-01T17:00:00+02:00") });
    const dringend = auftrag({ id: "d", prioritaet: "dringend" });
    const normal = auftrag({ id: "n", faelligAm: new Date("2026-09-03T17:00:00+02:00") });
    expect(fokusAuftrag([normal, dringend, ueberfaellig], jetzt)?.id).toBe("u");
    expect(fokusAuftrag([normal, dringend], jetzt)?.id).toBe("d");
  });

  it("uebergeht Wartezustaende, Pausierte und Abgeschlossene", () => {
    const wartet = auftrag({ id: "w", status: "wartet_auf_unterlagen" });
    const pause = auftrag({ id: "p", pausiertSeit: jetzt });
    const fertig = auftrag({ id: "f", status: "abgeschlossen" });
    expect(fokusAuftrag([wartet, pause, fertig], jetzt)).toBeNull();
    const arbeit = auftrag({ id: "a" });
    expect(fokusAuftrag([wartet, pause, fertig, arbeit], jetzt)?.id).toBe("a");
  });
});
