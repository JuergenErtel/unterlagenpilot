import { describe, it, expect } from "vitest";
import { berechneKennzahlen, baueDashboardListen, type AuftragFuerKennzahlen } from "@/lib/backoffice/kennzahlen";
import { liesQueueFilter, filtereQueue, sortiereQueue, type AuftragFuerQueue } from "@/lib/backoffice/queue";

/**
 * Kennzahlen, Dashboard-Listen und Queue sind reine Funktionen ueber
 * Auftragszeilen. Die Beispielauftraege decken jeden Zustand ab, den die
 * Zaehler unterscheiden.
 */

const TAG = 86_400_000;
const JETZT = new Date("2026-09-08T12:00:00Z");

let laufnummer = 0;

function auftrag(over: Partial<AuftragFuerQueue> = {}): AuftragFuerQueue {
  laufnummer += 1;
  return {
    id: `a-${laufnummer}`,
    auftragsnummer: `BO-2026-${String(laufnummer).padStart(4, "0")}`,
    aktenbezeichnung: `Akte ${laufnummer}`,
    auftraggeberId: "ag-1",
    auftraggeberName: "Finanzhaus Nord",
    auftragsart: "basis_pruefung",
    status: "in_aufbereitung",
    prioritaet: "normal",
    eingangAm: new Date(JETZT.getTime() - 5 * TAG),
    faelligAm: new Date(JETZT.getTime() + 3 * TAG),
    pausiertSeit: null,
    bearbeiterId: null,
    bearbeiterName: null,
    uebergebenAm: null,
    updatedAt: new Date(JETZT.getTime() - TAG),
    fehlendeUnterlagen: 0,
    ungepruefteDokumente: 0,
    offeneRueckfragen: 0,
    beantworteteRueckfragen: 0,
    ...over,
  };
}

/** Acht Auftraege, jeder mit einer eigenen Rolle im Zaehlwerk. */
function beispiele() {
  return {
    neu: auftrag({ status: "neu_eingegangen", faelligAm: new Date(JETZT.getTime() + 2 * TAG) }),
    heute: auftrag({ status: "in_aufbereitung", faelligAm: JETZT, bearbeiterId: "u-anna", bearbeiterName: "Anna", ungepruefteDokumente: 2 }),
    morgen: auftrag({ status: "auftrag_pruefen", faelligAm: new Date(JETZT.getTime() + 12 * 3600_000), bearbeiterId: "u-anna", bearbeiterName: "Anna" }),
    ueberfaellig: auftrag({ status: "in_aufbereitung", faelligAm: new Date(JETZT.getTime() - 2 * TAG), bearbeiterId: "u-ben", bearbeiterName: "Ben", ungepruefteDokumente: 3, prioritaet: "hoch" }),
    wartetUnterlagen: auftrag({ status: "wartet_auf_unterlagen", faelligAm: new Date(JETZT.getTime() - TAG) }),
    rueckfrage: auftrag({ status: "rueckfrage_auftraggeber", beantworteteRueckfragen: 1 }),
    qc: auftrag({ status: "qualitaetskontrolle", bearbeiterId: "u-ben", bearbeiterName: "Ben" }),
    fertig: auftrag({ status: "einreichungsfertig", bearbeiterId: "u-anna", bearbeiterName: "Anna" }),
    uebergebenHeute: auftrag({
      status: "uebergeben",
      eingangAm: new Date(JETZT.getTime() - 4 * TAG),
      uebergebenAm: new Date(JETZT.getTime() - 3600_000),
    }),
    abgeschlossen: auftrag({
      status: "abgeschlossen",
      eingangAm: new Date(JETZT.getTime() - 12 * TAG),
      uebergebenAm: new Date(JETZT.getTime() - 10 * TAG),
      ungepruefteDokumente: 9,
    }),
    storniert: auftrag({ status: "storniert", faelligAm: new Date(JETZT.getTime() - 20 * TAG) }),
  };
}

describe("berechneKennzahlen", () => {
  const b = beispiele();
  const alle: AuftragFuerKennzahlen[] = Object.values(b);
  const k = berechneKennzahlen(alle, JETZT);

  it("zählt neu eingegangene Aufträge", () => {
    expect(k.neuEingegangen).toBe(1);
  });

  it("zählt nur aktive Aufträge als Gesamtbestand", () => {
    // 11 Beispiele, davon abgeschlossen und storniert terminal.
    expect(k.aktiveGesamt).toBe(9);
  });

  it("zählt die Fristzustände", () => {
    expect(k.heuteFaellig).toBe(1);
    expect(k.slaGefaehrdet).toBe(1);
    // Der wartende Auftrag ist ueberfaellig, aber seine Frist ruht; der
    // stornierte hat keine Frist mehr.
    expect(k.slaUeberschritten).toBe(1);
  });

  it("zählt die Wartezustände getrennt und zusammen", () => {
    expect(k.wartetAufUnterlagen).toBe(1);
    expect(k.wartetAufAuftraggeber).toBe(2);
  });

  it("summiert ungeprüfte Dokumente nur über aktive Aufträge", () => {
    expect(k.dokumenteZuPruefen).toBe(5);
  });

  it("zählt offene Qualitätskontrollen", () => {
    expect(k.qualitaetskontrollenOffen).toBe(1);
  });

  it("zählt heute Fertiggestelltes nach Übergabedatum", () => {
    expect(k.heuteFertiggestellt).toBe(1);
  });

  it("mittelt die Bearbeitungstage über die Übergaben der letzten 30 Tage", () => {
    // uebergebenHeute: 4 Tage minus eine Stunde; abgeschlossen: 2 Tage.
    expect(k.durchschnittBearbeitungstage).toBeCloseTo(3, 0);
  });

  it("liefert null als Durchschnitt, wenn nichts übergeben wurde", () => {
    expect(berechneKennzahlen([b.neu, b.heute], JETZT).durchschnittBearbeitungstage).toBeNull();
  });

  it("gruppiert aktive Aufträge je Bearbeiter, Unzugewiesene als eigene Zeile", () => {
    const anna = k.jeBearbeiter.find((e) => e.bearbeiterId === "u-anna");
    const ben = k.jeBearbeiter.find((e) => e.bearbeiterId === "u-ben");
    const niemand = k.jeBearbeiter.find((e) => e.bearbeiterId === null);
    expect(anna?.anzahl).toBe(3);
    expect(ben?.anzahl).toBe(2);
    expect(niemand?.name).toBe("Nicht zugewiesen");
    expect(niemand?.anzahl).toBe(4);
    // Absteigend nach Anzahl.
    expect(k.jeBearbeiter[0]?.bearbeiterId).toBe(null);
  });

  it("listet je Status nur Status mit Bestand", () => {
    expect(k.jeStatus.every((s) => s.anzahl > 0)).toBe(true);
    expect(k.jeStatus.find((s) => s.status === "abgelehnt")).toBeUndefined();
    expect(k.jeStatus.find((s) => s.status === "in_aufbereitung")?.anzahl).toBe(2);
  });
});

describe("baueDashboardListen", () => {
  const b = beispiele();
  const alle = Object.values(b);
  const listen = baueDashboardListen(alle, JETZT);

  it("nimmt Wartezustände nicht in „jetzt bearbeiten“ auf", () => {
    const ids = listen.jetztBearbeiten.map((a) => a.id);
    expect(ids).not.toContain(b.wartetUnterlagen.id);
    expect(ids).not.toContain(b.rueckfrage.id);
    expect(ids).not.toContain(b.uebergebenHeute.id);
  });

  it("hält Qualitätskontrolle und Übergabebereites aus „jetzt bearbeiten“ heraus – sie haben eigene Listen", () => {
    const ids = listen.jetztBearbeiten.map((a) => a.id);
    expect(ids).not.toContain(b.qc.id);
    expect(ids).not.toContain(b.fertig.id);
    expect(listen.qualitaetskontrolle.map((a) => a.id)).toEqual([b.qc.id]);
    expect(listen.uebergabebereit.map((a) => a.id)).toEqual([b.fertig.id]);
  });

  it("sortiert „jetzt bearbeiten“ nach Priorität, dann nach Frist", () => {
    const ids = listen.jetztBearbeiten.map((a) => a.id);
    expect(ids[0]).toBe(b.ueberfaellig.id);
    expect(ids.indexOf(b.heute.id)).toBeLessThan(ids.indexOf(b.morgen.id));
    expect(ids.indexOf(b.morgen.id)).toBeLessThan(ids.indexOf(b.neu.id));
  });

  it("legt Heute-Fällige und Überfällige in die Fristliste, ruhende Fristen nicht", () => {
    const ids = listen.fristHeute.map((a) => a.id);
    expect(ids).toContain(b.heute.id);
    expect(ids).toContain(b.ueberfaellig.id);
    expect(ids).not.toContain(b.wartetUnterlagen.id);
    expect(ids).not.toContain(b.morgen.id);
  });

  it("zeigt eingegangene Rückmeldungen", () => {
    expect(listen.rueckmeldungEingegangen.map((a) => a.id)).toEqual([b.rueckfrage.id]);
  });

  it("lässt pausierte Aufträge aus allen Arbeitslisten heraus", () => {
    const pausiert = auftrag({ status: "in_aufbereitung", pausiertSeit: JETZT, faelligAm: JETZT });
    const l = baueDashboardListen([pausiert], JETZT);
    expect(l.jetztBearbeiten).toEqual([]);
    expect(l.fristHeute).toEqual([]);
    expect(l.zuletztBearbeitet.map((a) => a.id)).toEqual([pausiert.id]);
  });

  it("deckelt jede Liste", () => {
    const viele = Array.from({ length: 12 }, () => auftrag({ status: "in_aufbereitung" }));
    expect(baueDashboardListen(viele, JETZT, 5).jetztBearbeiten).toHaveLength(5);
    expect(baueDashboardListen(viele, JETZT).jetztBearbeiten).toHaveLength(8);
  });
});

describe("liesQueueFilter", () => {
  it("übernimmt gültige Werte", () => {
    const f = liesQueueFilter({ status: "in_aufbereitung", prioritaet: "hoch", sla: "heute", bearbeiter: "u-1", auftraggeber: "ag-1", art: "wohnflaeche", q: " Müller " });
    expect(f.status).toBe("in_aufbereitung");
    expect(f.prioritaet).toBe("hoch");
    expect(f.sla).toBe("heute");
    expect(f.bearbeiterId).toBe("u-1");
    expect(f.auftraggeberId).toBe("ag-1");
    expect(f.auftragsart).toBe("wohnflaeche");
    expect(f.suche).toBe("Müller");
  });

  it("macht aus unbekannten Werten null", () => {
    const f = liesQueueFilter({ status: "kaputt", prioritaet: "mega", sla: "irgendwann" });
    expect(f.status).toBeNull();
    expect(f.prioritaet).toBeNull();
    expect(f.sla).toBeNull();
  });

  it("kennt die Sammelwerte „aktiv“ und „alle“", () => {
    expect(liesQueueFilter({ status: "aktiv" }).status).toBe("aktiv");
    expect(liesQueueFilter({ status: "alle" }).status).toBe("alle");
  });

  it("nimmt bei Mehrfachwerten den ersten und ignoriert Leerstrings", () => {
    expect(liesQueueFilter({ status: ["neu_eingegangen", "alle"] }).status).toBe("neu_eingegangen");
    expect(liesQueueFilter({ q: "   " }).suche).toBeNull();
    expect(liesQueueFilter({}).bearbeiterId).toBeNull();
  });
});

describe("filtereQueue", () => {
  const b = beispiele();
  const alle = Object.values(b);

  it("schließt ohne Statusfilter (= aktiv) terminale Aufträge aus", () => {
    const ids = filtereQueue(alle, {}, JETZT).map((a) => a.id);
    expect(ids).not.toContain(b.abgeschlossen.id);
    expect(ids).not.toContain(b.storniert.id);
    expect(ids).toHaveLength(9);
  });

  it("zeigt mit „alle“ auch terminale Aufträge", () => {
    expect(filtereQueue(alle, { status: "alle" }, JETZT)).toHaveLength(alle.length);
  });

  it("filtert auf einen einzelnen Status", () => {
    expect(filtereQueue(alle, { status: "qualitaetskontrolle" }, JETZT).map((a) => a.id)).toEqual([b.qc.id]);
  });

  it("findet mit „keiner“ nur unzugewiesene Aufträge", () => {
    const r = filtereQueue(alle, { bearbeiterId: "keiner" }, JETZT);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((a) => a.bearbeiterId == null)).toBe(true);
  });

  it("filtert auf einen Bearbeiter", () => {
    const r = filtereQueue(alle, { bearbeiterId: "u-ben" }, JETZT);
    expect(r.map((a) => a.id).sort()).toEqual([b.ueberfaellig.id, b.qc.id].sort());
  });

  it("filtert auf den Fristzustand", () => {
    expect(filtereQueue(alle, { sla: "ueberschritten" }, JETZT).map((a) => a.id)).toEqual([b.ueberfaellig.id]);
    expect(filtereQueue(alle, { sla: "ruht" }, JETZT).map((a) => a.id).sort()).toEqual(
      [b.wartetUnterlagen.id, b.rueckfrage.id, b.uebergebenHeute.id].sort()
    );
  });

  it("sucht über Nummer, Bezeichnung und Auftraggeber ohne Rücksicht auf Groß- und Kleinschreibung", () => {
    const nummer = auftrag({ auftragsnummer: "BO-2026-0777" });
    const name = auftrag({ aktenbezeichnung: "Familie Schneider" });
    const ag = auftrag({ auftraggeberName: "Baufi Süd GmbH" });
    const liste = [nummer, name, ag, auftrag()];
    expect(filtereQueue(liste, { suche: "0777" }, JETZT).map((a) => a.id)).toEqual([nummer.id]);
    expect(filtereQueue(liste, { suche: "SCHNEIDER" }, JETZT).map((a) => a.id)).toEqual([name.id]);
    expect(filtereQueue(liste, { suche: "baufi süd" }, JETZT).map((a) => a.id)).toEqual([ag.id]);
    expect(filtereQueue(liste, { suche: "gibtesnicht" }, JETZT)).toEqual([]);
  });

  it("kombiniert Auftraggeber, Priorität und Auftragsart", () => {
    const treffer = auftrag({ auftraggeberId: "ag-2", prioritaet: "dringend", auftragsart: "wohnflaeche" });
    const fastTreffer = auftrag({ auftraggeberId: "ag-2", prioritaet: "dringend", auftragsart: "einreichung" });
    const r = filtereQueue([treffer, fastTreffer, ...alle], { auftraggeberId: "ag-2", prioritaet: "dringend", auftragsart: "wohnflaeche" }, JETZT);
    expect(r.map((a) => a.id)).toEqual([treffer.id]);
  });
});

describe("sortiereQueue", () => {
  it("stellt Überfälliges vor Heutiges vor Normales", () => {
    const normal = auftrag({ faelligAm: new Date(JETZT.getTime() + 3 * TAG) });
    const heute = auftrag({ faelligAm: JETZT });
    const ueberfaellig = auftrag({ faelligAm: new Date(JETZT.getTime() - TAG) });
    const ids = sortiereQueue([normal, heute, ueberfaellig], JETZT).map((a) => a.id);
    expect(ids).toEqual([ueberfaellig.id, heute.id, normal.id]);
  });

  it("stellt bei gleicher Fristlage Dringendes vor Normales", () => {
    const normal = auftrag({ prioritaet: "normal" });
    const dringend = auftrag({ prioritaet: "dringend" });
    const niedrig = auftrag({ prioritaet: "niedrig" });
    const ids = sortiereQueue([niedrig, normal, dringend], JETZT).map((a) => a.id);
    expect(ids).toEqual([dringend.id, normal.id, niedrig.id]);
  });

  it("lässt die Priorität nicht über die Fristlage gewinnen", () => {
    const dringendSpaeter = auftrag({ prioritaet: "dringend", faelligAm: new Date(JETZT.getTime() + 5 * TAG) });
    const normalUeberfaellig = auftrag({ prioritaet: "normal", faelligAm: new Date(JETZT.getTime() - TAG) });
    const ids = sortiereQueue([dringendSpaeter, normalUeberfaellig], JETZT).map((a) => a.id);
    expect(ids).toEqual([normalUeberfaellig.id, dringendSpaeter.id]);
  });

  it("stellt Ruhende und Pausierte hinter Aktive, Terminale ganz ans Ende", () => {
    const terminal = auftrag({ status: "abgeschlossen", prioritaet: "dringend" });
    const pausiert = auftrag({ pausiertSeit: JETZT, prioritaet: "dringend", faelligAm: new Date(JETZT.getTime() - TAG) });
    const ruht = auftrag({ status: "wartet_auf_unterlagen", faelligAm: new Date(JETZT.getTime() - TAG) });
    const aktiv = auftrag({ prioritaet: "niedrig", faelligAm: new Date(JETZT.getTime() + 10 * TAG) });
    const ids = sortiereQueue([terminal, pausiert, ruht, aktiv], JETZT).map((a) => a.id);
    expect(ids).toEqual([aktiv.id, ruht.id, pausiert.id, terminal.id]);
  });

  it("sortiert bei gleicher Lage nach Frist, dann nach Eingang", () => {
    const spaet = auftrag({ faelligAm: new Date(JETZT.getTime() + 4 * TAG) });
    const frueh = auftrag({ faelligAm: new Date(JETZT.getTime() + 2 * TAG) });
    const ohneFristAlt = auftrag({ faelligAm: null, eingangAm: new Date(JETZT.getTime() - 30 * TAG) });
    const ohneFristNeu = auftrag({ faelligAm: null, eingangAm: new Date(JETZT.getTime() - TAG) });
    const ids = sortiereQueue([ohneFristNeu, spaet, ohneFristAlt, frueh], JETZT).map((a) => a.id);
    expect(ids).toEqual([frueh.id, spaet.id, ohneFristAlt.id, ohneFristNeu.id]);
  });

  it("verändert die Eingabe nicht", () => {
    const liste = [auftrag({ faelligAm: JETZT }), auftrag({ faelligAm: new Date(JETZT.getTime() - TAG) })];
    const kopie = [...liste];
    sortiereQueue(liste, JETZT);
    expect(liste).toEqual(kopie);
  });
});
