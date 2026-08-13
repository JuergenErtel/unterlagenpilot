import { describe, it, expect } from "vitest";
import { baueMaske, formatiereWert } from "@/lib/erstgespraech/maske";
import { berechneReife } from "@/lib/erstgespraech/reife";
import { wandleWert } from "@/lib/actions/zielwert";
import { FINANCING_TYPES } from "@/lib/domain/enums";
import type { Fallstand } from "@/lib/self-disclosure/takeover";

const leererStand: Fallstand = {
  applicants: [{ position: 1 }],
  property: null,
  financingRequest: null,
  caseFelder: { financingType: null },
};

const maske = (stand: Fallstand, personen: 1 | 2 = 1) =>
  baueMaske(stand, personen, berechneReife(stand, personen));

const alleFelder = (stand: Fallstand, personen: 1 | 2 = 1) =>
  maske(stand, personen).flatMap((a) => a.felder);

describe("Maske fuers Erstgespraech", () => {
  it("bietet fuer JEDE angebotsrelevante Angabe ein Eingabefeld – in jeder Finanzierungsart", () => {
    // Die bindende Zusage: Was die Reifeleiste anmahnt, muss die Maske auch
    // ausfuellen koennen. Sonst zeigt die Leiste eine Luecke, die niemand
    // schliessen kann.
    for (const art of [...FINANCING_TYPES, null]) {
      for (const beruf of ["angestellter", "selbststaendiger", "rentner", null]) {
        const stand: Fallstand = {
          applicants: [
            { position: 1, employment: beruf ? [{ beschaeftigungsart: beruf }] : [] },
            { position: 2, employment: [] },
          ],
          property: null,
          financingRequest: null,
          caseFelder: { financingType: art },
        };
        const reife = berechneReife(stand, 2);
        const ziele = new Set(
          baueMaske(stand, 2, reife)
            .flatMap((a) => a.felder)
            .map((f) => `${f.ziel.entitaet}.${f.ziel.feld}.${f.person ?? 1}`)
        );
        for (const r of reife.felder) {
          expect(
            ziele.has(`${r.quelle}.${r.schluessel}.${r.person ?? 1}`),
            `${art ?? "ohne Art"}/${beruf ?? "ohne Beruf"}: ${r.quelle}.${r.schluessel} fehlt in der Maske`
          ).toBe(true);
        }
      }
    }
  });

  it("gibt jedem Zielfeld genau eine Eingabe", () => {
    // Zwei Eingaben auf derselben Spalte hiessen: die zuletzt verlassene
    // gewinnt, und der Vermittler sieht nicht, welche das war.
    const stand: Fallstand = { ...leererStand, caseFelder: { financingType: "neubau" } };
    const schluessel = alleFelder(stand).map((f) => `${f.ziel.entitaet}.${f.ziel.feld}.${f.person ?? 1}`);
    expect(new Set(schluessel).size).toBe(schluessel.length);
  });

  it("laesst nur Felder mit Zielspalte zu – Listen und Merkposten bleiben draussen", () => {
    for (const f of alleFelder(leererStand)) {
      expect(f.ziel.entitaet).not.toBe("liability");
      expect(f.ziel.entitaet).not.toBe("asset");
      expect(f.ziel.feld).toBeTruthy();
    }
  });

  it("bietet bei Enum-Spalten die Werte des Schemas an, nicht die Kundensprache", () => {
    // "arbeiter" gibt es im Bogen, aber nicht in der Spalte EmploymentType –
    // ungefiltert geschrieben wuerde Prisma zur Laufzeit werfen.
    const beruf = alleFelder(leererStand).find((f) => f.ziel.feld === "beschaeftigungsart")!;
    const werte = (beruf.optionen ?? []).map((o) => o.wert);
    expect(werte).toContain("freiberufler");
    expect(werte).not.toContain("arbeiter");

    const art = alleFelder(leererStand).find((f) => f.ziel.feld === "financingType")!;
    expect((art.optionen ?? []).map((o) => o.wert)).not.toContain("kauf_bestand");
  });

  it("fragt bei zwei Antragstellern die Personenfelder zweimal, den Haushalt einmal", () => {
    const stand: Fallstand = {
      ...leererStand,
      applicants: [{ position: 1 }, { position: 2 }],
    };
    const felder = alleFelder(stand, 2);
    expect(felder.filter((f) => f.ziel.feld === "vorname")).toHaveLength(2);
    expect(felder.filter((f) => f.ziel.feld === "anzahlKinder")).toHaveLength(1);
  });

  it("meldet je Abschnitt, wie viele angebotsrelevante Angaben stehen", () => {
    const stand: Fallstand = {
      ...leererStand,
      applicants: [{ position: 1, vorname: "Anna" }],
    };
    const person = maske(stand).find((a) => a.id === "person")!;
    expect(person.relevant).toBeGreaterThan(0);
    expect(person.gefuellt).toBe(1);
  });

  it("schreibt Vorbelegungen so, wie der Schreibkern sie zurueckliest", () => {
    // Ein Feld, das der Vermittler nur ueberspringt, darf beim Verlassen
    // keinen anderen Wert speichern als den, der drinstand.
    expect(wandleWert("kaufpreis", formatiereWert("betrag", 895000))).toBe(895000);
    expect(wandleWert("beteiligungProzent", formatiereWert("zahl", 33.333))).toBe(33.333);
    expect(wandleWert("baujahr", formatiereWert("zahl", 1998))).toBe(1998);
    expect(wandleWert("wohnflaeche", formatiereWert("zahl", 129.5))).toBe(129.5);
    expect(wandleWert("sondertilgungGewuenscht", formatiereWert("ja_nein", false))).toBe(false);
    expect(formatiereWert("datum", new Date("1987-09-18"))).toBe("1987-09-18");
    expect(formatiereWert("betrag", null)).toBe("");
  });

  it("uebernimmt vorhandene Werte aus dem Fall in die Maske", () => {
    const stand: Fallstand = {
      applicants: [{ position: 1, vorname: "Anna", income: [{ nettoMonatlich: 3200 }] }],
      property: { wohnflaeche: 129.5 },
      financingRequest: { kaufpreis: 895000, sondertilgungGewuenscht: true },
      caseFelder: { financingType: "kauf" },
    };
    const felder = alleFelder(stand);
    const wert = (feld: string) => felder.find((f) => f.ziel.feld === feld)?.wert;
    expect(wert("kaufpreis")).toBe("895.000");
    expect(wert("wohnflaeche")).toBe("129,5");
    expect(wert("nettoMonatlich")).toBe("3.200");
    expect(wert("vorname")).toBe("Anna");
    expect(wert("sondertilgungGewuenscht")).toBe("ja");
    expect(wert("financingType")).toBe("kauf");
  });

  it("zeigt beim Neubau Kaufpreis UND Baukosten", () => {
    const stand: Fallstand = { ...leererStand, caseFelder: { financingType: "neubau" } };
    const ziele = alleFelder(stand).map((f) => f.ziel.feld);
    expect(ziele).toContain("kaufpreis");
    expect(ziele).toContain("baukosten");
  });
});
