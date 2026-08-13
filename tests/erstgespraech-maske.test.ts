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
    expect(wandleWert("sondertilgungProzentJaehrlich", formatiereWert("zahl", 5))).toBe(5);
    expect(formatiereWert("datum", new Date("1987-09-18"))).toBe("1987-09-18");
    expect(formatiereWert("betrag", null)).toBe("");
  });

  it("uebernimmt vorhandene Werte aus dem Fall in die Maske", () => {
    const stand: Fallstand = {
      applicants: [{ position: 1, vorname: "Anna", income: [{ nettoMonatlich: 3200 }] }],
      property: { wohnflaeche: 129.5 },
      financingRequest: { kaufpreis: 895000, sondertilgungProzentJaehrlich: 5 },
      caseFelder: { financingType: "kauf" },
    };
    const felder = alleFelder(stand);
    const wert = (feld: string) => felder.find((f) => f.ziel.feld === feld)?.wert;
    expect(wert("kaufpreis")).toBe("895.000");
    expect(wert("wohnflaeche")).toBe("129,5");
    expect(wert("nettoMonatlich")).toBe("3.200");
    expect(wert("vorname")).toBe("Anna");
    expect(wert("sondertilgungProzentJaehrlich")).toBe("5");
    expect(wert("financingType")).toBe("kauf");
  });

  it("zeigt beim Neubau Kaufpreis UND Baukosten", () => {
    const stand: Fallstand = { ...leererStand, caseFelder: { financingType: "neubau" } };
    const ziele = alleFelder(stand).map((f) => f.ziel.feld);
    expect(ziele).toContain("kaufpreis");
    expect(ziele).toContain("baukosten");
  });
});

/**
 * Die Angaben rund um den Arbeitsvertrag haengen an der Beschaeftigungsart.
 *
 * Vorher taten sie das nicht: Weil `inProbezeit` und `befristet` als
 * angebotsrelevant galten – unabhaengig von der Beschaeftigungsart – und nur
 * im Katalogschritt `beruf_dauer` vorkommen, zog `ergaenzeUnerreichbare`
 * diesen Schritt fuer JEDEN Fall herein. Die Maske fragte damit auch einen
 * Rentner nach "Beschaeftigt seit", "Arbeitsvertrag befristet?" und "In
 * Probezeit?" – Angaben, die es fuer ihn nicht gibt, die aber trotzdem als
 * offen gezaehlt wurden und die Angebotsreife nie voll werden liessen.
 */
describe("Arbeitsvertrags-Angaben haengen an der Beschaeftigungsart", () => {
  const ARBEITSVERTRAG_ZIELE = ["eintrittsdatum", "befristet", "inProbezeit"];

  function standMit(beruf: string | null): Fallstand {
    return {
      applicants: [{ position: 1, employment: beruf ? [{ beschaeftigungsart: beruf }] : [] }],
      property: null,
      financingRequest: null,
      caseFelder: { financingType: "kauf" },
    };
  }

  const maskenZiele = (beruf: string | null) => alleFelder(standMit(beruf)).map((f) => f.ziel.feld);
  const reifeSchluessel = (beruf: string | null) =>
    berechneReife(standMit(beruf), 1).felder.map((f) => f.schluessel);

  it("fragt einen Angestellten nach Eintritt, Befristung und Probezeit", () => {
    expect(maskenZiele("angestellter")).toEqual(expect.arrayContaining(ARBEITSVERTRAG_ZIELE));
    expect(reifeSchluessel("angestellter")).toEqual(expect.arrayContaining(["befristet", "inProbezeit"]));
  });

  it("fragt einen Beamten ebenso", () => {
    expect(maskenZiele("beamter")).toEqual(expect.arrayContaining(ARBEITSVERTRAG_ZIELE));
  });

  it("fragt einen Rentner NICHT danach – und zaehlt es auch nicht als offen", () => {
    for (const ziel of ARBEITSVERTRAG_ZIELE) {
      expect(maskenZiele("rentner"), `Rentner wird nach ${ziel} gefragt`).not.toContain(ziel);
    }
    expect(reifeSchluessel("rentner")).not.toContain("befristet");
    expect(reifeSchluessel("rentner")).not.toContain("inProbezeit");
  });

  it("fragt Selbststaendige, Freiberufler, Geschaeftsfuehrer und Gesellschafter NICHT danach", () => {
    for (const beruf of ["selbststaendiger", "freiberufler", "geschaeftsfuehrer", "gesellschafter"]) {
      for (const ziel of ARBEITSVERTRAG_ZIELE) {
        expect(maskenZiele(beruf), `${beruf} wird nach ${ziel} gefragt`).not.toContain(ziel);
      }
      expect(reifeSchluessel(beruf)).not.toContain("befristet");
      expect(reifeSchluessel(beruf)).not.toContain("inProbezeit");
    }
  });

  it("fragt bei UNBEKANNTER Beschaeftigungsart weiter danach", () => {
    // Die Beschaeftigungsart ist selbst eine der Angaben und darf leer sein.
    // Verschwaenden die Folgefragen schon vorher, fiele eine Angabe still weg,
    // bevor der Vermittler ueberhaupt gefragt hat.
    expect(maskenZiele(null)).toEqual(expect.arrayContaining(ARBEITSVERTRAG_ZIELE));
    expect(reifeSchluessel(null)).toEqual(expect.arrayContaining(["befristet", "inProbezeit"]));
  });

  it("laesst die Gesamtzahl der Angaben fallabhaengig schrumpfen – um genau die zwei", () => {
    const offen = berechneReife(standMit(null), 1).gesamt;
    expect(berechneReife(standMit("rentner"), 1).gesamt).toBe(offen - 2);
    expect(berechneReife(standMit("angestellter"), 1).gesamt).toBe(offen);
  });

  it("entscheidet je Antragsteller, nicht je Fall", () => {
    // Der angestellte Partner einer Selbststaendigen wird sehr wohl nach
    // seinem Arbeitsvertrag gefragt.
    const stand: Fallstand = {
      applicants: [
        { position: 1, employment: [{ beschaeftigungsart: "selbststaendiger" }] },
        { position: 2, employment: [{ beschaeftigungsart: "angestellter" }] },
      ],
      property: null,
      financingRequest: null,
      caseFelder: { financingType: "kauf" },
    };
    const reife = berechneReife(stand, 2);
    const personen = reife.felder.filter((f) => f.schluessel === "inProbezeit").map((f) => f.person);
    expect(personen).toEqual([2]);

    const felder = baueMaske(stand, 2, reife).flatMap((a) => a.felder);
    const probezeit = felder.filter((f) => f.ziel.feld === "inProbezeit");
    expect(probezeit).toHaveLength(1);
    expect(probezeit[0]!.person).toBe(2);
  });
});

/**
 * Was die Reife fuer diesen Fall nicht zaehlt, fragt die Maske auch nicht.
 *
 * Bisher lief die Abstimmung nur in EINE Richtung: `ergaenzeUnerreichbare`
 * zieht Katalogschritte herein, damit jede gezaehlte Angabe eingebbar ist. Die
 * Gegenrichtung fehlte – und die faellt anders als bei den Arbeitsvertrags-
 * Angaben nicht von selbst weg: Die Grundstuecksgroesse steht im Schritt "Wie
 * gross ist die Immobilie?" NEBEN Wohnflaeche und Baujahr. Der Schritt bleibt
 * sichtbar, also fragte die Maske auch den Kaeufer einer Eigentumswohnung nach
 * der Grundstuecksgroesse. Ebenso die Maklergebuehr bei einer
 * Anschlussfinanzierung: Der Katalog blendet zwar die Ja/Nein-Frage aus, das
 * Prozentfeld haengt aber an der im Gespraech hart gesetzten Antwort "ja".
 */
describe("Die Maske folgt der Reife feldweise", () => {
  const objektZiele = (objektart: string | null, financingType: string | null = "kauf") =>
    alleFelder({
      ...leererStand,
      property: objektart ? { objektart } : null,
      caseFelder: { financingType },
    }).map((f) => f.ziel.feld);

  it("fragt bei einer Eigentumswohnung nicht nach der Grundstuecksgroesse", () => {
    const ziele = objektZiele("eigentumswohnung");
    expect(ziele).not.toContain("grundstuecksflaeche");
    // Die Nachbarfelder desselben Schritts bleiben stehen.
    expect(ziele).toContain("wohnflaeche");
    expect(ziele).toContain("baujahr");
  });

  it("fragt bei einem Haus weiter danach", () => {
    expect(objektZiele("einfamilienhaus")).toContain("grundstuecksflaeche");
  });

  it("fragt bei unbekannter Objektart weiter danach", () => {
    expect(objektZiele(null)).toContain("grundstuecksflaeche");
  });

  it("fragt bei einem unbebauten Grundstueck nicht nach Wohnflaeche und Baujahr", () => {
    const ziele = objektZiele("grundstueck");
    expect(ziele).not.toContain("wohnflaeche");
    expect(ziele).not.toContain("baujahr");
    expect(ziele).toContain("grundstuecksflaeche");
  });

  it("fragt bei einer Anschlussfinanzierung nicht nach der Maklergebuehr", () => {
    expect(objektZiele(null, "anschlussfinanzierung")).not.toContain("maklerprovisionProzent");
  });

  it("fragt beim Kauf weiter nach der Maklergebuehr", () => {
    expect(objektZiele(null, "kauf")).toContain("maklerprovisionProzent");
  });
});
