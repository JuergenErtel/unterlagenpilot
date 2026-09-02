import { describe, it, expect } from "vitest";
import {
  UEBERGAENGE,
  pruefeUebergang,
  moeglicheUebergaenge,
  fristLaeuft,
  wartetAufAuftraggeber,
  stationIndex,
  STATUS_STATIONEN,
} from "@/lib/backoffice/status";
import { BACKOFFICE_STATUS, BACKOFFICE_TERMINAL_STATUS, type BackofficeStatus } from "@/lib/domain/enums";

/**
 * Das Statusmodell ist eine Tabelle; hier wird geprueft, dass die Tabelle
 * das sagt, was der Prozess verspricht - und dass pruefeUebergang die
 * Tabelle korrekt liest.
 */

type Eingabe = Parameters<typeof pruefeUebergang>[0];

function eingabe(over: Partial<Eingabe> = {}): Eingabe {
  return {
    von: "neu_eingegangen",
    nach: "auftrag_pruefen",
    rolle: "bearbeiter",
    userId: "u-1",
    bearbeiterId: null,
    pausiert: false,
    begruendung: null,
    ...over,
  };
}

describe("pruefeUebergang – erlaubte Übergänge", () => {
  it("lässt einen Bearbeiter einen neuen Auftrag in die Prüfung nehmen", () => {
    const r = pruefeUebergang(eingabe());
    expect(r.erlaubt).toBe(true);
    if (r.erlaubt) expect(r.uebergang.label).toBe("Auftrag prüfen");
  });

  it("lässt die Aufbereitung in die Qualitätskontrolle gehen", () => {
    expect(pruefeUebergang(eingabe({ von: "in_aufbereitung", nach: "qualitaetskontrolle" })).erlaubt).toBe(true);
  });
});

describe("pruefeUebergang – verbotene Übergänge", () => {
  it("lässt einen neuen Auftrag nicht direkt übergeben", () => {
    const r = pruefeUebergang(eingabe({ von: "neu_eingegangen", nach: "uebergeben", rolle: "manager" }));
    expect(r.erlaubt).toBe(false);
  });

  it("lässt die Aufbereitung nicht an der Qualitätskontrolle vorbei zur Einreichungsreife springen", () => {
    const r = pruefeUebergang(eingabe({ von: "in_aufbereitung", nach: "einreichungsfertig", rolle: "manager" }));
    expect(r.erlaubt).toBe(false);
  });

  it("lässt einen abgeschlossenen Auftrag nirgendwohin mehr", () => {
    for (const nach of BACKOFFICE_STATUS) {
      const r = pruefeUebergang(eingabe({ von: "abgeschlossen", nach, rolle: "manager" }));
      expect(r.erlaubt, `abgeschlossen → ${nach}`).toBe(false);
    }
  });
});

describe("pruefeUebergang – Rollen", () => {
  it("lässt einen Bearbeiter nicht ablehnen", () => {
    const r = pruefeUebergang(
      eingabe({ von: "neu_eingegangen", nach: "abgelehnt", rolle: "bearbeiter", begruendung: "Unvollständig" })
    );
    expect(r.erlaubt).toBe(false);
    if (!r.erlaubt) expect(r.grund).toMatch(/Berechtigung/);
  });

  it("lässt einen Prüfer freigeben", () => {
    expect(
      pruefeUebergang(eingabe({ von: "qualitaetskontrolle", nach: "einreichungsfertig", rolle: "pruefer" })).erlaubt
    ).toBe(true);
  });

  it("lässt einen Bearbeiter einen fremd zugewiesenen Auftrag nicht schieben", () => {
    const r = pruefeUebergang(eingabe({ userId: "u-1", bearbeiterId: "u-2" }));
    expect(r.erlaubt).toBe(false);
    if (!r.erlaubt) expect(r.grund).toMatch(/anderen Person/);
  });

  it("lässt einen Bearbeiter einen unzugewiesenen Auftrag schieben", () => {
    expect(pruefeUebergang(eingabe({ userId: "u-1", bearbeiterId: null })).erlaubt).toBe(true);
  });

  it("lässt einen Bearbeiter seinen eigenen Auftrag schieben", () => {
    expect(pruefeUebergang(eingabe({ userId: "u-1", bearbeiterId: "u-1" })).erlaubt).toBe(true);
  });

  it("bindet Manager nicht an die Zuweisung", () => {
    expect(pruefeUebergang(eingabe({ rolle: "manager", userId: "u-1", bearbeiterId: "u-2" })).erlaubt).toBe(true);
  });

  it("verweigert ohne Backoffice-Rolle alles", () => {
    const r = pruefeUebergang(eingabe({ rolle: null }));
    expect(r.erlaubt).toBe(false);
  });
});

describe("pruefeUebergang – Sperren", () => {
  it("blockt einen pausierten Auftrag", () => {
    const r = pruefeUebergang(eingabe({ pausiert: true }));
    expect(r.erlaubt).toBe(false);
    if (!r.erlaubt) expect(r.grund).toMatch(/pausiert/);
  });

  it("blockt einen begründungspflichtigen Übergang ohne Text", () => {
    const ohne = pruefeUebergang(eingabe({ von: "neu_eingegangen", nach: "abgelehnt", rolle: "manager", begruendung: "   " }));
    expect(ohne.erlaubt).toBe(false);
    if (!ohne.erlaubt) expect(ohne.grund).toMatch(/Begründung/);

    const mit = pruefeUebergang(eingabe({ von: "neu_eingegangen", nach: "abgelehnt", rolle: "manager", begruendung: "Kein Mandat" }));
    expect(mit.erlaubt).toBe(true);
  });
});

describe("UEBERGAENGE – Tabelle als Ganzes", () => {
  it("bietet aus jedem nicht-terminalen Status mindestens einen Übergang", () => {
    for (const status of BACKOFFICE_STATUS) {
      if (BACKOFFICE_TERMINAL_STATUS.has(status)) continue;
      expect(moeglicheUebergaenge(status).length, status).toBeGreaterThan(0);
    }
  });

  it("bietet aus terminalen Status keinen Übergang", () => {
    for (const status of BACKOFFICE_TERMINAL_STATUS) {
      expect(moeglicheUebergaenge(status)).toEqual([]);
    }
  });

  it("erreicht „übergeben“ ausschließlich aus „einreichungsfertig“", () => {
    const quellen = UEBERGAENGE.filter((u) => u.nach === "uebergeben").map((u) => u.von);
    expect(quellen).toEqual(["einreichungsfertig"]);
  });

  it("erreicht „einreichungsfertig“ ausschließlich aus der Qualitätskontrolle", () => {
    const quellen = UEBERGAENGE.filter((u) => u.nach === "einreichungsfertig").map((u) => u.von);
    expect(quellen).toEqual(["qualitaetskontrolle"]);
  });

  it("verlangt für jede Ablehnung und jedes Storno eine Begründung", () => {
    for (const u of UEBERGAENGE) {
      if (u.nach === "abgelehnt" || u.nach === "storniert") {
        expect(u.begruendungPflicht, `${u.von} → ${u.nach}`).toBe(true);
        expect(u.rollen).toEqual(["manager"]);
      }
    }
  });

  it("kennt in der Tabelle nur Status aus dem Enum", () => {
    const bekannt = new Set<string>(BACKOFFICE_STATUS);
    for (const u of UEBERGAENGE) {
      expect(bekannt.has(u.von), u.von).toBe(true);
      expect(bekannt.has(u.nach), u.nach).toBe(true);
    }
  });

  it("enthält keinen Übergang doppelt", () => {
    const schluessel = UEBERGAENGE.map((u) => `${u.von}>${u.nach}`);
    expect(new Set(schluessel).size).toBe(schluessel.length);
  });
});

describe("Hilfsfunktionen", () => {
  it("lässt die Frist nur laufen, wenn das Backoffice am Zug ist", () => {
    expect(fristLaeuft("in_aufbereitung")).toBe(true);
    expect(fristLaeuft("auftrag_pruefen")).toBe(true);
    expect(fristLaeuft("wartet_auf_unterlagen")).toBe(false);
    expect(fristLaeuft("rueckfrage_auftraggeber")).toBe(false);
    expect(fristLaeuft("uebergeben")).toBe(false);
    expect(fristLaeuft("abgeschlossen")).toBe(false);
    expect(fristLaeuft("storniert")).toBe(false);
  });

  it("erkennt die beiden Wartezustände", () => {
    const wartend = BACKOFFICE_STATUS.filter(wartetAufAuftraggeber);
    expect(wartend.sort()).toEqual(["rueckfrage_auftraggeber", "wartet_auf_unterlagen"]);
  });

  it("legt Wartezustände und Nachbearbeitung auf die Station „in Aufbereitung“", () => {
    const aufbereitung = STATUS_STATIONEN.indexOf("in_aufbereitung");
    expect(stationIndex("wartet_auf_unterlagen")).toBe(aufbereitung);
    expect(stationIndex("rueckfrage_auftraggeber")).toBe(aufbereitung);
    expect(stationIndex("nachbearbeitung")).toBe(aufbereitung);
  });

  it("ordnet die Hauptstationen in Prozessreihenfolge", () => {
    expect(stationIndex("neu_eingegangen")).toBe(0);
    expect(stationIndex("uebergeben")).toBeLessThan(stationIndex("abgeschlossen"));
    expect(stationIndex("qualitaetskontrolle")).toBeLessThan(stationIndex("einreichungsfertig"));
  });

  it("gibt für Status ohne Station -1 zurück", () => {
    const ohne: BackofficeStatus[] = ["abgelehnt", "storniert"];
    for (const s of ohne) expect(stationIndex(s)).toBe(-1);
  });
});
