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
    const plan = planUebernahme({ "p1.person_name.vorname": "Thomas" }, leererStand);
    const v = plan.vorschlaege.find((x) => x.schluessel === "p1.person_name.vorname")!;
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
    const plan = planUebernahme({ "p1.person_name.vorname": "Thomas" }, stand);
    const v = plan.vorschlaege.find((x) => x.schluessel === "p1.person_name.vorname")!;
    expect(v.art).toBe("abweichung");
    expect(v.fallwert).toBe("Tomas");
  });

  it("schlägt nichts vor, wenn der Wert bereits übereinstimmt", () => {
    const stand: Fallstand = {
      ...leererStand,
      applicants: [{ id: "a1", position: 1, vorname: "Thomas" }],
    };
    const plan = planUebernahme({ "p1.person_name.vorname": "Thomas" }, stand);
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
      "anzahl_antragsteller.anzahl": "2",
      "p2.person_name.vorname": "Laura",
    };
    const plan = planUebernahme(a, leererStand);
    const v = plan.vorschlaege.find((x) => x.schluessel === "p2.person_name.vorname")!;
    expect(v.ziel.person).toBe(2);
  });

  it("schreibt die Kinderzahl auf beide Antragsteller", () => {
    const a: Antworten = { "anzahl_antragsteller.anzahl": "2", "haushalt_kinder.anzahl": 2 };
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
    const plan = planUebernahme({ "kaufpreis.betrag": 400000 }, stand);
    expect(plan.vorschlaege.some((v) => v.ziel.feld === "kaufpreis")).toBe(false);
  });

  it("liefert Einkommen als Vorschlag mit Personenbezug", () => {
    const plan = planUebernahme({ "p1.einkommen.netto": 3200 }, leererStand);
    const v = plan.vorschlaege.find((x) => x.ziel.feld === "nettoMonatlich")!;
    expect(v.ziel.entitaet).toBe("income");
    expect(v.ziel.person).toBe(1);
    expect(v.art).toBe("luecke");
  });
});
