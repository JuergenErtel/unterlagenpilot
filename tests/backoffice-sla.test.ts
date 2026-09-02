import { describe, it, expect } from "vitest";
import { faelligkeitNachWerktagen, werktageZwischen, bewerteSla, periodeVon } from "@/lib/backoffice/sla";

/**
 * Fristen rechnen in Werktagen nach Berliner Ortszeit. Die Testzeitpunkte
 * liegen um die Mittagszeit (UTC), damit keine Tagesgrenze zwischen UTC und
 * Berlin dazwischenfaellt.
 */

const TAG = 86_400_000;

/** 2026-09-04 ist ein Freitag. */
const FREITAG = new Date("2026-09-04T10:00:00Z");
const SAMSTAG = new Date("2026-09-05T10:00:00Z");
const MONTAG = new Date("2026-09-07T10:00:00Z");

function wochentagBerlin(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", weekday: "short" }).format(d);
}

function tagBerlin(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

describe("faelligkeitNachWerktagen", () => {
  it("macht aus Freitag plus drei Werktagen den Mittwoch", () => {
    expect(wochentagBerlin(FREITAG)).toBe("Fri");
    const f = faelligkeitNachWerktagen(FREITAG, 3);
    expect(wochentagBerlin(f)).toBe("Wed");
    expect(tagBerlin(f)).toBe("09.09.2026");
  });

  it("überspringt das Wochenende – Freitag plus ein Werktag ist Montag", () => {
    const f = faelligkeitNachWerktagen(FREITAG, 1);
    expect(tagBerlin(f)).toBe(tagBerlin(MONTAG));
  });

  it("zählt ab einem Samstag erst ab Montag", () => {
    const f = faelligkeitNachWerktagen(SAMSTAG, 1);
    expect(tagBerlin(f)).toBe(tagBerlin(MONTAG));
  });

  it("lässt die Uhrzeit unverändert", () => {
    const f = faelligkeitNachWerktagen(FREITAG, 3);
    expect(f.getUTCHours()).toBe(FREITAG.getUTCHours());
    expect(f.getUTCMinutes()).toBe(FREITAG.getUTCMinutes());
  });

  it("liefert bei null Werktagen denselben Zeitpunkt", () => {
    expect(faelligkeitNachWerktagen(FREITAG, 0).getTime()).toBe(FREITAG.getTime());
  });

  it("behandelt negative oder krumme Werte wie abgerundete Werktage", () => {
    expect(faelligkeitNachWerktagen(FREITAG, -2).getTime()).toBe(FREITAG.getTime());
    expect(faelligkeitNachWerktagen(FREITAG, 1.9).getTime()).toBe(faelligkeitNachWerktagen(FREITAG, 1).getTime());
  });
});

describe("werktageZwischen", () => {
  it("zählt von Freitag bis Mittwoch drei Werktage", () => {
    expect(werktageZwischen(FREITAG, new Date("2026-09-09T10:00:00Z"))).toBe(3);
  });

  it("zählt über ein Wochenende nur den Montag", () => {
    expect(werktageZwischen(FREITAG, MONTAG)).toBe(1);
  });

  it("zählt zwischen Samstag und Sonntag nichts", () => {
    expect(werktageZwischen(SAMSTAG, new Date(SAMSTAG.getTime() + TAG))).toBe(0);
  });

  it("wird negativ, wenn das Ende vor dem Anfang liegt", () => {
    expect(werktageZwischen(MONTAG, FREITAG)).toBe(-1);
  });

  it("ist die Umkehrung von faelligkeitNachWerktagen", () => {
    for (const n of [1, 2, 5, 10]) {
      expect(werktageZwischen(FREITAG, faelligkeitNachWerktagen(FREITAG, n))).toBe(n);
    }
  });
});

describe("bewerteSla", () => {
  const jetzt = new Date("2026-09-08T12:00:00Z");

  it("meldet „ok“ bei einer Frist in drei Tagen", () => {
    const r = bewerteSla({ faelligAm: new Date(jetzt.getTime() + 3 * TAG), status: "in_aufbereitung", pausiert: false, jetzt });
    expect(r.zustand).toBe("ok");
    expect(r.tageBisFrist).toBe(3);
    expect(r.label).toBe("in 3 Tagen");
  });

  it("meldet „heute“, wenn die Frist am selben Tag liegt", () => {
    const r = bewerteSla({ faelligAm: jetzt, status: "in_aufbereitung", pausiert: false, jetzt });
    expect(r.zustand).toBe("heute");
    expect(r.tageBisFrist).toBe(0);
  });

  it("meldet „gefährdet“, wenn die Frist morgen ist", () => {
    const r = bewerteSla({ faelligAm: new Date(jetzt.getTime() + 12 * 3600_000), status: "auftrag_pruefen", pausiert: false, jetzt });
    expect(r.zustand).toBe("gefaehrdet");
    expect(r.label).toBe("Morgen fällig");
  });

  it("meldet „überschritten“ mit der Anzahl der Tage", () => {
    const r = bewerteSla({ faelligAm: new Date(jetzt.getTime() - 2 * TAG), status: "in_aufbereitung", pausiert: false, jetzt });
    expect(r.zustand).toBe("ueberschritten");
    expect(r.tageBisFrist).toBe(-2);
    expect(r.label).toBe("2 Tage überfällig");

    const einer = bewerteSla({ faelligAm: new Date(jetzt.getTime() - TAG), status: "in_aufbereitung", pausiert: false, jetzt });
    expect(einer.label).toBe("1 Tag überfällig");
  });

  it("lässt die Frist ruhen, wenn Unterlagen vom Auftraggeber fehlen", () => {
    const r = bewerteSla({ faelligAm: new Date(jetzt.getTime() - 2 * TAG), status: "wartet_auf_unterlagen", pausiert: false, jetzt });
    expect(r.zustand).toBe("ruht");
    // Die Frist selbst bleibt stehen – sie wird nur nicht bewertet.
    expect(r.tageBisFrist).toBe(-2);
  });

  it("lässt die Frist ruhen, solange eine Rückfrage offen ist", () => {
    const r = bewerteSla({ faelligAm: new Date(jetzt.getTime() + TAG), status: "rueckfrage_auftraggeber", pausiert: false, jetzt });
    expect(r.zustand).toBe("ruht");
  });

  it("lässt die Frist bei einem pausierten Auftrag ruhen", () => {
    const r = bewerteSla({ faelligAm: new Date(jetzt.getTime() - 5 * TAG), status: "in_aufbereitung", pausiert: true, jetzt });
    expect(r.zustand).toBe("ruht");
    expect(r.label).toBe("Frist ruht");
  });

  it("meldet „keine“ ohne Frist", () => {
    const r = bewerteSla({ faelligAm: null, status: "in_aufbereitung", pausiert: false, jetzt });
    expect(r.zustand).toBe("keine");
    expect(r.tageBisFrist).toBeNull();
  });

  it("meldet „keine“ bei einem abgeschlossenen Auftrag, auch wenn die Frist längst vorbei ist", () => {
    for (const status of ["abgeschlossen", "abgelehnt", "storniert"] as const) {
      const r = bewerteSla({ faelligAm: new Date(jetzt.getTime() - 10 * TAG), status, pausiert: false, jetzt });
      expect(r.zustand, status).toBe("keine");
    }
  });

  it("lässt die Frist nach der Übergabe ruhen – dort wartet das Backoffice auf die Abnahme", () => {
    const r = bewerteSla({ faelligAm: new Date(jetzt.getTime() - TAG), status: "uebergeben", pausiert: false, jetzt });
    expect(r.zustand).toBe("ruht");
  });
});

describe("periodeVon", () => {
  it("liefert Jahr und Monat als JJJJ-MM", () => {
    expect(periodeVon(new Date("2026-01-15T12:00:00Z"))).toBe("2026-01");
    expect(periodeVon(new Date("2026-12-03T12:00:00Z"))).toBe("2026-12");
  });

  it("rechnet in Berliner Ortszeit – kurz vor Mitternacht UTC ist in Berlin schon der nächste Monat", () => {
    expect(periodeVon(new Date("2025-12-31T23:30:00Z"))).toBe("2026-01");
  });
});
