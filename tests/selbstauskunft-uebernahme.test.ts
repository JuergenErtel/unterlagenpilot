import { describe, it, expect } from "vitest";
import { planUebernahme, type Fallstand } from "@/lib/self-disclosure/takeover";
import type { Antworten } from "@/lib/self-disclosure/types";

const leererStand: Fallstand = {
  applicants: [{ id: "a1", position: 1 }],
  property: null,
  financingRequest: null,
  caseFelder: {},
};

describe("planUebernahme", () => {
  it("macht aus einer Angabe zu einem leeren Feld einen Lückenvorschlag", () => {
    const plan = planUebernahme({ "p1.personen.vorname": "Thomas" }, leererStand);
    const v = plan.vorschlaege.find((x) => x.schluessel === "p1.personen.vorname")!;
    expect(v.art).toBe("luecke");
    expect(v.kundenwert).toBe("Thomas");
    expect(v.fallwert).toBeNull();
    expect(v.ziel).toEqual({ entitaet: "applicant", feld: "vorname", person: 1 });
  });

  it("macht aus einem abweichenden Wert einen Abweichungsvorschlag", () => {
    const stand: Fallstand = {
      ...leererStand,
      applicants: [{ id: "a1", position: 1, vorname: "Tomas" }],
    };
    const plan = planUebernahme({ "p1.personen.vorname": "Thomas" }, stand);
    const v = plan.vorschlaege.find((x) => x.schluessel === "p1.personen.vorname")!;
    expect(v.art).toBe("abweichung");
    expect(v.fallwert).toBe("Tomas");
  });

  it("schlägt nichts vor, wenn der Wert bereits übereinstimmt", () => {
    const stand: Fallstand = {
      ...leererStand,
      applicants: [{ id: "a1", position: 1, vorname: "Thomas" }],
    };
    const plan = planUebernahme({ "p1.personen.vorname": "Thomas" }, stand);
    expect(plan.vorschlaege).toHaveLength(0);
  });

  it("macht aus einer Lücke NIE einen Vorschlag – nichts wird geleert", () => {
    const stand: Fallstand = {
      ...leererStand,
      applicants: [{ id: "a1", position: 1, vorname: "Thomas" }],
    };
    const plan = planUebernahme({}, stand);
    expect(plan.vorschlaege).toHaveLength(0);
  });

  it("führt übersprungene Angaben als offen auf", () => {
    const plan = planUebernahme({}, leererStand);
    expect(plan.offen.some((o) => o.label.startsWith("Vorname"))).toBe(true);
  });

  it("ordnet Antworten der zweiten Person dem zweiten Antragsteller zu", () => {
    const a: Antworten = {
      "haushalt.anzahl": "2",
      "p2.personen.vorname": "Laura",
    };
    const plan = planUebernahme(a, leererStand);
    const v = plan.vorschlaege.find((x) => x.schluessel === "p2.personen.vorname")!;
    expect(v.ziel.person).toBe(2);
  });

  it("schreibt die Kinderzahl auf beide Antragsteller", () => {
    const a: Antworten = { "haushalt.anzahl": "2", "haushalt.kinder": 2 };
    const plan = planUebernahme(a, {
      ...leererStand,
      applicants: [
        { id: "a1", position: 1 },
        { id: "a2", position: 2 },
      ],
    });
    const kinder = plan.vorschlaege.filter((v) => v.ziel.feld === "anzahlKinder");
    expect(kinder.map((k) => k.ziel.person).sort()).toEqual([1, 2]);
  });

  it("sammelt Angaben ohne Zielfeld getrennt ein", () => {
    const plan = planUebernahme({ "haushalt_ausgaben.warmmiete": 950 }, leererStand);
    expect(plan.ohneZiel.some((o) => o.wert === "950")).toBe(true);
    expect(plan.vorschlaege.some((v) => v.schluessel.startsWith("haushalt_ausgaben"))).toBe(false);
  });

  it("erkennt einen gleichen Zahlenwert trotz unterschiedlicher Schreibweise", () => {
    const stand: Fallstand = { ...leererStand, financingRequest: { kaufpreis: 400000 } };
    const plan = planUebernahme({ "objekt_preis.kaufpreis": 400000 }, stand);
    expect(plan.vorschlaege.some((v) => v.ziel.feld === "kaufpreis")).toBe(false);
  });

  it("liefert Einkommen als Vorschlag mit Personenbezug", () => {
    const plan = planUebernahme({ "p1.personen.netto": 3200 }, leererStand);
    const v = plan.vorschlaege.find((x) => x.ziel.feld === "nettoMonatlich")!;
    expect(v.ziel.entitaet).toBe("income");
    expect(v.ziel.person).toBe(1);
    expect(v.art).toBe("luecke");
  });

  it("nimmt eine gegebene Antwort auf, auch wenn ihre Feldbedingung inzwischen nicht mehr greift", () => {
    // Regel: "Wer liest, nimmt die volle Kette" – planUebernahme MUSS ueber
    // schritt.felder gehen, nicht ueber sichtbareFelder. Sonst: Kunde
    // beantwortet ein bedingtes Feld, aendert spaeter die Steuerantwort – der
    // Wert steht weiter in `answers`, verschwindet aber lautlos aus Vorschlag
    // UND "ohneZiel".
    //
    // Genau dieser Fall am echten Katalog: "Restschuld" gehoert zur
    // Anschlussfinanzierung. Wer sie beantwortet und dann auf "Kauf
    // Bestandsimmobilie" umstellt, hat den Betrag trotzdem genannt.
    const antworten: Antworten = {
      "vorhaben.art": "kauf_bestand",
      "objekt_preis.restschuld": 1000,
    };
    const plan = planUebernahme(antworten, leererStand);
    expect(plan.vorschlaege.some((v) => v.schluessel === "objekt_preis.restschuld")).toBe(true);
  });
});

/**
 * Zwei beantwortete Felder, EIN Zielfeld.
 *
 * Seit dem Katalogschnitt stehen `objekt_preis.kaufpreis` und
 * `objekt_preis.grundstueck` (beide -> financingRequest.kaufpreis) sowie
 * `restschuld`, `kapitalbedarf` und `darlehen` (alle ->
 * financingRequest.darlehenswunsch) auf IMMER sichtbaren Seiten. Wer im Bogen
 * zurueckgeht und die Vorhabensart wechselt, hat danach zwei Betraege in den
 * Antworten. Weil `planUebernahme` bewusst ueber ALLE Felder laeuft ("eine
 * gegebene Antwort darf nicht verschwinden"), wurden daraus zwei Vorschlaege
 * auf dieselbe Spalte – geschrieben wird in Katalogreihenfolge, die letzte
 * Zuweisung gewinnt. Beim oeffentlichen Weg ohne jede Rueckfrage.
 *
 * Die Regel: Das GERADE SICHTBARE Feld gewinnt, die anderen wandern nach
 * `ohneZiel`. Dann geht nichts verloren und nichts ueberschreibt sich stumm.
 */
describe("planUebernahme bei zwei Antworten auf dasselbe Zielfeld", () => {
  it("nimmt den Darlehenswunsch des sichtbaren Felds, nicht den der alten Vorhabensart", () => {
    const antworten: Antworten = {
      "vorhaben.art": "kauf_bestand",
      // Gehoert zur Anschlussfinanzierung – der Kunde hatte sie zuerst gewaehlt.
      "objekt_preis.restschuld": 250000,
      "finanzierungswunsch.darlehen": 320000,
    };
    const plan = planUebernahme(antworten, leererStand);
    const darlehen = plan.vorschlaege.filter((v) => v.ziel.feld === "darlehenswunsch");
    expect(darlehen.map((v) => v.kundenwert)).toEqual(["320000"]);
    // Verloren geht die andere Antwort trotzdem nicht.
    expect(plan.ohneZiel.some((o) => o.wert === "250000")).toBe(true);
  });

  it("nimmt beim eigenen Bauvorhaben den Grundstueckspreis, nicht den alten Kaufpreis", () => {
    const antworten: Antworten = {
      "vorhaben.art": "eigenes_bauvorhaben",
      "objekt_preis.kaufpreis": 400000,
      "objekt_preis.grundstueck": 120000,
    };
    const plan = planUebernahme(antworten, leererStand);
    const kaufpreis = plan.vorschlaege.filter((v) => v.ziel.feld === "kaufpreis");
    expect(kaufpreis.map((v) => v.kundenwert)).toEqual(["120000"]);
    expect(plan.ohneZiel.some((o) => o.wert === "400000")).toBe(true);
  });

  it("laesst eine einzelne Antwort auch dann Vorschlag sein, wenn sie unsichtbar ist", () => {
    // Die Gegenrichtung: Ohne Konkurrenz gibt es nichts zu entscheiden, und die
    // Regel "eine gegebene Antwort darf nicht verschwinden" gilt weiter.
    const plan = planUebernahme(
      { "vorhaben.art": "kauf_bestand", "objekt_preis.restschuld": 250000 },
      leererStand
    );
    expect(plan.vorschlaege.some((v) => v.ziel.feld === "darlehenswunsch")).toBe(true);
  });
});
