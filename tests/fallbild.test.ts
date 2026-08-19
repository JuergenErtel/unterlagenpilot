import { describe, it, expect } from "vitest";
import { baueFallbild, TOR_IDS, FELD_IDS, type FallbildEingabe } from "@/lib/cases/fallbild";
import type { CockpitData } from "@/lib/cases/cockpit";
import type { NextStep } from "@/lib/cases/next-step";

const cockpit = (over: Partial<CockpitData> = {}): CockpitData => ({
  caseId: "c1",
  caseNumber: "UP-2026-0014",
  applicantNames: "Behrend",
  status: "unterlagen_fehlen",
  leadPhase: "neu",
  score: 50,
  scoreTone: "review",
  scoreLabel: "Teilweise vollständig",
  blockers: [],
  platformReadiness: [{ platform: "europace", percent: 60, missingFields: 12, missingDocs: 5 }],
  roadmap: [],
  nextActions: [],
  missingGroups: [
    { key: "sofort", title: "Sofort erforderlich", tone: "blocker", items: [] },
    { key: "spaeter", title: "Später erforderlich", tone: "review", items: [] },
  ],
  counts: {
    docsPresent: 7,
    docsMissing: 5,
    pruefbereit: 3,
    warnings: 4,
    criticals: 0,
    docsFehler: 0,
    docsLaufend: 0,
    offeneBefunde: 0,
    machbarkeitBlockiert: false,
  },
  missingCustomerFields: [],
  machbarkeit: { auslauf: 94, band: "bis100", ueberschuss: 840, machbar: true },
  anforderungsAbgleich: null,
  ...over,
});

const schritt = (over: Partial<NextStep> = {}): NextStep => ({
  key: "dokumente_freigeben",
  title: "3 Dokumente freigeben",
  reason: "Die KI hat sie ausgewertet.",
  tone: "ai",
  ...over,
});

const eingabe = (over: Partial<FallbildEingabe> = {}): FallbildEingabe => ({
  cockpit: cockpit(),
  schritt: schritt(),
  erstkontakt: { empfaenger: "a@b.de", vorbereitet: true, versendet: true },
  objekt: { objektart: "Reihenhaus", ort: "Meerbusch", wohnflaeche: 118, berechnungFreigegeben: false },
  objektAngaben: { gefuellt: 5, gesamt: 6, fehlend: ["Baujahr"] },
  einreichung: { phaseEingereicht: false, stand: null },
  finanzierung: { kaufpreis: 420000 },
  offeneAnfragen: 2,
  ...over,
});

const tor = (b: ReturnType<typeof baueFallbild>, id: string) => b.tore.find((t) => t.id === id)!;
const feld = (b: ReturnType<typeof baueFallbild>, id: string) => b.felder.find((f) => f.id === id)!;

describe("Vollzähligkeit", () => {
  it("liefert immer sechs Tore in fester Reihenfolge", () => {
    expect(baueFallbild(eingabe()).tore.map((t) => t.id)).toEqual([...TOR_IDS]);
  });

  it("liefert immer vier Felder in fester Reihenfolge", () => {
    expect(baueFallbild(eingabe()).felder.map((f) => f.id)).toEqual([...FELD_IDS]);
  });

  it("liefert auch bei leerem Fall alle Elemente", () => {
    const leer = baueFallbild(
      eingabe({
        cockpit: cockpit({
          platformReadiness: [],
          missingCustomerFields: ["Geburtsdatum"],
          machbarkeit: null,
          counts: { ...cockpit().counts, docsPresent: 0, docsMissing: 0, pruefbereit: 0, warnings: 0 },
        }),
        erstkontakt: { empfaenger: null, vorbereitet: false, versendet: false },
        objekt: { objektart: null, ort: null, wohnflaeche: null, berechnungFreigegeben: false },
        objektAngaben: { gefuellt: 0, gesamt: 6, fehlend: ["Objektart", "PLZ des Objekts", "Wohnfläche", "Grundstücksgröße", "Baujahr", "Nutzung"] },
        einreichung: { phaseEingereicht: false, stand: null },
        finanzierung: { kaufpreis: null },
        offeneAnfragen: 0,
      })
    );
    expect(leer.tore).toHaveLength(6);
    expect(leer.felder).toHaveLength(4);
    expect(leer.fall.betrag).toBe("Kaufpreis offen");
    expect(leer.fall.vorhaben).toBe("Vorhaben offen");
  });
});

describe("Sperrregeln", () => {
  it("sperrt die Einreichung bei einem kritischen Hinweis und nennt den Grund", () => {
    const b = baueFallbild(
      eingabe({ cockpit: cockpit({ counts: { ...cockpit().counts, criticals: 1 } }) })
    );
    expect(tor(b, "einreichung").gesperrt).toBe("wartet auf die Prüfung");
  });

  it("sperrt die Einreichung bei fehlenden Kundendaten", () => {
    const b = baueFallbild(eingabe({ cockpit: cockpit({ missingCustomerFields: ["Geburtsdatum"] }) }));
    expect(tor(b, "einreichung").gesperrt).toBe("wartet auf die Kundendaten");
  });

  it("sperrt die Einreichung bei fehlender Pflichtunterlage", () => {
    const b = baueFallbild(
      eingabe({
        cockpit: cockpit({
          missingGroups: [
            {
              key: "sofort", title: "Sofort erforderlich", tone: "blocker",
              items: [{ key: "perso", title: "Personalausweis", reason: "Pflicht" }],
            },
          ],
        }),
      })
    );
    expect(tor(b, "einreichung").gesperrt).toBe("wartet auf Pflichtunterlagen");
  });

  it("sperrt ohne Blocker gar nichts", () => {
    const b = baueFallbild(eingabe());
    expect(tor(b, "einreichung").gesperrt).toBeUndefined();
    expect(tor(b, "unterlagen").gesperrt).toBeUndefined();
    expect(tor(b, "kundendaten").gesperrt).toBeUndefined();
    expect(tor(b, "erstkontakt").gesperrt).toBeUndefined();
  });

  it("sperrt die Prüfung nur, solange kein Dokument da ist", () => {
    const ohne = baueFallbild(
      eingabe({ cockpit: cockpit({ counts: { ...cockpit().counts, docsPresent: 0, pruefbereit: 0 } }) })
    );
    expect(tor(ohne, "pruefung").gesperrt).toBe("wartet auf die ersten Unterlagen");
    expect(tor(baueFallbild(eingabe()), "pruefung").gesperrt).toBeUndefined();
  });

  it("behält bei gesperrtem Tor den vorhandenen Fortschritt", () => {
    // Das ist der Kern: gesperrt ist ein Merkmal, kein Zustand. Die Einreichung
    // ist zu 60 % vorbereitet UND blockiert – beides muss sichtbar bleiben.
    const b = baueFallbild(eingabe({ cockpit: cockpit({ counts: { ...cockpit().counts, criticals: 1 } }) }));
    const e = tor(b, "einreichung");
    expect(e.gesperrt).toBeTruthy();
    expect(e.anteil).toBe(60);
  });
});

describe("Wertebereiche", () => {
  it("hält jeden Anteil zwischen 0 und 100", () => {
    const b = baueFallbild(
      eingabe({
        cockpit: cockpit({
          platformReadiness: [{ platform: "europace", percent: 999, missingFields: 0, missingDocs: 0 }],
          counts: { ...cockpit().counts, docsPresent: 2, pruefbereit: 9, docsFehler: 4 },
        }),
      })
    );
    for (const t of b.tore) {
      expect(t.anteil).toBeGreaterThanOrEqual(0);
      expect(t.anteil).toBeLessThanOrEqual(100);
    }
  });

  it("kommt ohne Plattformdaten ohne Absturz aus", () => {
    const b = baueFallbild(eingabe({ cockpit: cockpit({ platformReadiness: [] }) }));
    expect(tor(b, "einreichung").anteil).toBe(0);
  });
});

describe("Objektdaten als eigene Station", () => {
  it("liegt zwischen Kundendaten und Unterlagen", () => {
    const ids = baueFallbild(eingabe()).tore.map((t) => t.id);
    expect(ids.indexOf("objektdaten")).toBe(ids.indexOf("kundendaten") + 1);
    expect(ids.indexOf("unterlagen")).toBe(ids.indexOf("objektdaten") + 1);
  });

  it("zählt die Angaben, statt sie zu schätzen", () => {
    const t = tor(baueFallbild(eingabe({ objektAngaben: { gefuellt: 3, gesamt: 6, fehlend: ["Baujahr", "Nutzung", "Wohnfläche"] } })), "objektdaten");
    expect(t.zustand).toBe("3 von 6");
    expect(t.anteil).toBe(50);
    expect(t.ton).toBe("review");
    expect(t.detail).toContain("Baujahr");
  });

  it("meldet vollständige Angaben als fertig", () => {
    const t = tor(baueFallbild(eingabe({ objektAngaben: { gefuellt: 6, gesamt: 6, fehlend: [] } })), "objektdaten");
    expect(t.zustand).toBe("vollständig");
    expect(t.anteil).toBe(100);
    expect(t.ton).toBe("ready");
  });

  it("führt bei vollständigen Angaben weiter zur Wohnflächenberechnung", () => {
    const b = baueFallbild(eingabe({ objektAngaben: { gefuellt: 6, gesamt: 6, fehlend: [] } }));
    expect(tor(b, "objektdaten").ziel.href).toContain("/wohnflaeche");
    const offen = baueFallbild(eingabe({ objektAngaben: { gefuellt: 1, gesamt: 6, fehlend: ["Baujahr"] } }));
    expect(tor(offen, "objektdaten").ziel.href).toContain("/erstgespraech");
  });

  it("behandelt einen Fall ohne verlangte Objektangaben nicht als Lücke", () => {
    const t = tor(baueFallbild(eingabe({ objektAngaben: { gefuellt: 0, gesamt: 0, fehlend: [] } })), "objektdaten");
    expect(t.anteil).toBe(100);
    expect(t.ton).toBe("ready");
  });
});

describe("Einreichung: Vorbereitung vs. Wirklichkeit", () => {
  const stand = (over: Record<string, unknown> = {}) => ({
    bank: "ING",
    darlehenssumme: 320000,
    sollzinsProzent: 3.45,
    zinsbindungJahre: 10,
    rateMonatlich: 1480,
    tilgungProzent: null,
    plattform: "Europace",
    quelle: "manuell",
    eingereichtAm: "2026-08-19",
    notiz: null,
    leer: false,
    ...over,
  }) as NonNullable<FallbildEingabe["einreichung"]["stand"]>;

  it("nennt die Bank, sobald der Fall raus ist", () => {
    const t = tor(
      baueFallbild(eingabe({ einreichung: { phaseEingereicht: true, stand: stand() } })),
      "einreichung"
    );
    expect(t.zustand).toBe("bei ING");
    expect(t.anteil).toBe(100);
    expect(t.ton).toBe("ready");
    expect(t.detail).toContain("3,45 %");
    expect(t.detail).toContain("10 J. Bindung");
  });

  it("benennt fehlende Konditionen, statt Vollständigkeit zu behaupten", () => {
    const t = tor(
      baueFallbild(
        eingabe({
          einreichung: {
            phaseEingereicht: true,
            stand: stand({ sollzinsProzent: null, rateMonatlich: null }),
          },
        })
      ),
      "einreichung"
    );
    expect(t.ton).toBe("review");
    expect(t.detail).toContain("Sollzins");
    expect(t.detail).toContain("Rate oder Tilgung");
  });

  it("zeigt ohne Einreichung weiter die Vorbereitung", () => {
    const t = tor(baueFallbild(eingabe()), "einreichung");
    expect(t.zustand).not.toContain("bei ");
  });

  it("heißt die Dokumentenprüfung nicht mehr nur „Prüfung“", () => {
    expect(tor(baueFallbild(eingabe()), "pruefung").name).toBe("Dokumentenprüfung");
  });
});

describe("Keine erfundenen Werte", () => {
  it("zeigt ohne Machbarkeitsurteil „noch nicht berechnet“ statt einer Zahl", () => {
    const b = baueFallbild(eingabe({ cockpit: cockpit({ machbarkeit: null }) }));
    expect(feld(b, "machbarkeit").wert).toBe("noch nicht berechnet");
    expect(feld(b, "einkommen").wert).toBe("noch nicht berechnet");
    expect(feld(b, "machbarkeit").ton).toBe("neutral");
  });

  it("sagt ausdrücklich, dass „nicht berechenbar“ kein „nicht machbar“ ist", () => {
    const b = baueFallbild(eingabe({ cockpit: cockpit({ machbarkeit: null }) }));
    expect(feld(b, "machbarkeit").detail).toContain("nicht, dass der Fall nicht machbar ist");
  });

  it("zeigt ohne Wohnfläche keine erfundene Zahl", () => {
    const b = baueFallbild(
      eingabe({ objekt: { objektart: null, ort: null, wohnflaeche: null, berechnungFreigegeben: false } })
    );
    expect(feld(b, "objekt").wert).toBe("keine Fläche");
  });

  it("unterscheidet geprüfte von ungeprüfter Wohnfläche", () => {
    const roh = baueFallbild(eingabe());
    expect(feld(roh, "objekt").zeile).toBe("Wohnfläche ungeprüft");
    const geprueft = baueFallbild(
      eingabe({ objekt: { objektart: "Reihenhaus", ort: "Meerbusch", wohnflaeche: 118, berechnungFreigegeben: true } })
    );
    expect(feld(geprueft, "objekt").zeile).toBe("Wohnfläche geprüft");
    expect(feld(geprueft, "objekt").ton).toBe("ready");
  });

  it("meldet einen Fehlbetrag als Blocker, nicht als Überschuss", () => {
    const b = baueFallbild(
      eingabe({ cockpit: cockpit({ machbarkeit: { auslauf: 94, band: "bis100", ueberschuss: -210, machbar: false } }) })
    );
    expect(feld(b, "einkommen").wert).toBe("-210 €");
    expect(feld(b, "einkommen").zeile).toBe("Fehlbetrag im Monat");
    expect(feld(b, "einkommen").ton).toBe("blocker");
  });
});

describe("Marke für den nächsten Schritt", () => {
  it("setzt die Freigabe auf die Prüfung", () => {
    expect(baueFallbild(eingabe()).naechstes.markiert).toBe("pruefung");
  });

  it("setzt die Machbarkeit auf das Feld", () => {
    const b = baueFallbild(eingabe({ schritt: schritt({ key: "machbarkeit" }) }));
    expect(b.naechstes.markiert).toBe("machbarkeit");
  });

  it("setzt gar keine Marke, wenn der Schritt nirgends hingehört", () => {
    // Lieber keine Marke als eine, die auf das Falsche zeigt.
    const b = baueFallbild(eingabe({ schritt: schritt({ key: "fristen", title: "Frist läuft ab" }) }));
    expect(b.naechstes.markiert).toBeNull();
    expect(b.naechstes.titel).toBe("Frist läuft ab");
  });

  it("markiert jede Marke auf ein vorhandenes Element", () => {
    const b = baueFallbild(eingabe());
    const ids = [...b.tore.map((t) => t.id), ...b.felder.map((f) => f.id)];
    for (const key of ["ki_laeuft", "kundendaten", "unterlagen_anfordern", "einreichung"] as const) {
      const m = baueFallbild(eingabe({ schritt: schritt({ key }) })).naechstes.markiert;
      expect(ids).toContain(m);
    }
  });

  it("übernimmt den Handlungsknopf des Schritts", () => {
    const b = baueFallbild(
      eingabe({ schritt: schritt({ cta: { label: "Review-Center öffnen", href: "/review?case=c1" } }) })
    );
    expect(b.naechstes.ziel).toEqual({ label: "Review-Center öffnen", href: "/review?case=c1" });
  });

  it("reicht die wartenden Schritte durch", () => {
    // Ab der lg-Breite zeigt die Fallseite NUR das Fallbild. Wurde das Feld
    // hier nicht uebertragen, war "Wartet ausserdem" auf jedem gewoehnlichen
    // Desktop unsichtbar – samt Abbruchvorschlag und offener Dokumentfreigabe.
    const b = baueFallbild(
      eingabe({
        schritt: schritt({
          wartet: [
            { label: "3 Dokumente prüfen & freigeben", href: "/review?case=c1" },
            { label: "Kunde seit 3 Tagen nicht erreichbar – im Board als verloren markieren?", href: "/dashboard" },
          ],
        }),
      })
    );
    expect(b.naechstes.wartet).toEqual([
      { label: "3 Dokumente prüfen & freigeben", href: "/review?case=c1" },
      { label: "Kunde seit 3 Tagen nicht erreichbar – im Board als verloren markieren?", href: "/dashboard" },
    ]);
  });

  it("laesst wartet weg, wenn der Schritt keine verdraengten Schritte hat", () => {
    expect(baueFallbild(eingabe()).naechstes.wartet).toBeUndefined();
  });
});

describe("Erstkontakt", () => {
  it("kennt versendet, Entwurf, fehlende Adresse und offen", () => {
    const fall = (k: FallbildEingabe["erstkontakt"]) => tor(baueFallbild(eingabe({ erstkontakt: k })), "erstkontakt");
    expect(fall({ empfaenger: "a@b.de", vorbereitet: true, versendet: true }).zustand).toBe("versendet");
    expect(fall({ empfaenger: "a@b.de", vorbereitet: true, versendet: false }).zustand).toBe("Entwurf liegt bereit");
    expect(fall({ empfaenger: null, vorbereitet: false, versendet: false }).ton).toBe("blocker");
    expect(fall({ empfaenger: "a@b.de", vorbereitet: false, versendet: false }).zustand).toBe("noch nicht vorbereitet");
  });
});
