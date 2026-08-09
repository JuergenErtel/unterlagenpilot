import { describe, expect, it } from "vitest";
import { canonicalToKundenangaben } from "@/lib/platforms/europace/kundenangaben-mapping";
import type { CanonicalCase } from "@/lib/domain/canonical";
import { validateKundenangabenRequest } from "./helpers/europace-schema";

/** Minimaler Fall; einzelne Tests ueberschreiben gezielt Felder. */
function fall(teil: Partial<CanonicalCase> = {}): CanonicalCase {
  return {
    caseNumber: "UP-2026-0001",
    applicants: [],
    employment: [],
    income: [],
    liabilities: [],
    assets: [],
    financing: {},
    ...teil,
  } as CanonicalCase;
}

describe("canonicalToKundenangaben – Grundgeruest", () => {
  it("setzt den Datenkontext und die BaufiDesk-Fallnummer als externeVorgangsId", () => {
    const r = canonicalToKundenangaben(fall(), { datenkontext: "TEST_MODUS" });
    expect(r.importMetadaten.datenkontext).toBe("TEST_MODUS");
    expect(r.importMetadaten.externeVorgangsId).toBe("UP-2026-0001");
  });

  it("erzeugt fuer einen leeren Fall einen schemakonformen Request", () => {
    const r = canonicalToKundenangaben(fall(), { datenkontext: "TEST_MODUS" });
    expect(validateKundenangabenRequest(r).errors).toEqual([]);
  });
});

describe("canonicalToKundenangaben – Haushalt", () => {
  const angestellt = fall({
    applicants: [
      {
        position: 1,
        vorname: "Anna",
        nachname: "Muster",
        geburtsdatum: "1985-04-12",
        familienstand: "verheiratet",
        anzahlKinder: 2,
        email: "anna@example.de",
        telefon: "030 1234567",
        strasse: "Hauptstr. 5",
        plz: "10115",
        ort: "Berlin",
      },
    ],
    employment: [
      {
        applicantPosition: 1,
        beschaeftigungsart: "angestellter",
        beruf: "Projektleiterin",
        arbeitgeber: "Beispiel GmbH",
        eintrittsdatum: "2019-03-01",
        inProbezeit: false,
      },
    ],
    income: [{ applicantPosition: 1, nettoMonatlich: 3200, bruttoMonatlich: 5000 }],
  });

  it("mappt Personendaten inklusive Familienstand als @type", () => {
    const r = canonicalToKundenangaben(angestellt, { datenkontext: "TEST_MODUS" });
    const kunde = r.kundenangaben.haushalte![0]!.kunden![0]!;
    expect(kunde.referenzId).toBe("antragsteller-1");
    expect(kunde.personendaten!.person).toEqual({ vorname: "Anna", nachname: "Muster" });
    expect(kunde.personendaten!.geburtsdatum).toBe("1985-04-12");
    expect(kunde.personendaten!.familienstand).toEqual({ "@type": "VERHEIRATET" });
  });

  it("mappt Kontakt und Wohnsituation", () => {
    const r = canonicalToKundenangaben(angestellt, { datenkontext: "TEST_MODUS" });
    const kunde = r.kundenangaben.haushalte![0]!.kunden![0]!;
    expect(kunde.kontakt!.email).toBe("anna@example.de");
    expect(kunde.wohnsituation!.anschrift).toEqual({
      strasse: "Hauptstr.",
      hausnummer: "5",
      plz: "10115",
      ort: "Berlin",
    });
  });

  it("mappt Beschaeftigung als ANGESTELLTER mit Arbeitgeber und Probezeit", () => {
    const r = canonicalToKundenangaben(angestellt, { datenkontext: "TEST_MODUS" });
    const finanzielles = r.kundenangaben.haushalte![0]!.kunden![0]!.finanzielles!;
    expect(finanzielles.einkommenNetto).toBe(3200);
    expect(finanzielles.beschaeftigung).toEqual({
      "@type": "ANGESTELLTER",
      beruf: "Projektleiterin",
      beschaeftigungsverhaeltnis: {
        arbeitgeber: { name: "Beispiel GmbH" },
        beschaeftigtSeit: "2019-03-01",
        probezeit: false,
      },
    });
  });

  it("mappt Selbststaendige ohne Arbeitgeberblock", () => {
    const r = canonicalToKundenangaben(
      fall({
        applicants: [{ position: 1, vorname: "Bert", nachname: "Sole" }],
        employment: [{ applicantPosition: 1, beschaeftigungsart: "selbststaendiger", beruf: "Tischler" }],
      }),
      { datenkontext: "TEST_MODUS" }
    );
    expect(r.kundenangaben.haushalte![0]!.kunden![0]!.finanzielles!.beschaeftigung).toEqual({
      "@type": "SELBSTSTAENDIGER",
      beruf: "Tischler",
    });
  });

  it("laesst beruf bei Rentnern weg, weil das Schema dort kein beruf-Feld kennt", () => {
    const r = canonicalToKundenangaben(
      fall({
        applicants: [{ position: 1, vorname: "Erna", nachname: "Alt" }],
        employment: [
          { applicantPosition: 1, beschaeftigungsart: "rentner", beruf: "ehemals Bankkaufmann" },
        ],
      }),
      { datenkontext: "TEST_MODUS" }
    );
    expect(r.kundenangaben.haushalte![0]!.kunden![0]!.finanzielles!.beschaeftigung).toEqual({
      "@type": "RENTNER",
    });
  });

  it("legt zwei Antragsteller in denselben Haushalt", () => {
    const r = canonicalToKundenangaben(
      fall({
        applicants: [
          { position: 1, vorname: "Anna", nachname: "Muster" },
          { position: 2, vorname: "Ben", nachname: "Muster" },
        ],
      }),
      { datenkontext: "TEST_MODUS" }
    );
    expect(r.kundenangaben.haushalte).toHaveLength(1);
    expect(r.kundenangaben.haushalte![0]!.kunden).toHaveLength(2);
    expect(r.kundenangaben.haushalte![0]!.kunden![1]!.referenzId).toBe("antragsteller-2");
  });

  it("erzeugt auch mit vollem Haushalt einen schemakonformen Request", () => {
    const r = canonicalToKundenangaben(angestellt, { datenkontext: "TEST_MODUS" });
    expect(validateKundenangabenRequest(r).errors).toEqual([]);
  });
});

describe("canonicalToKundenangaben – Finanzierungsobjekt", () => {
  const mitObjekt = fall({
    property: {
      objektart: "einfamilienhaus",
      strasse: "Feldweg 12a",
      plz: "14467",
      ort: "Potsdam",
      wohnflaeche: 142.5,
      baujahr: 1998,
      grundstuecksflaeche: 620,
    },
  });

  it("mappt die Objektart als @type und die Adresse getrennt", () => {
    const r = canonicalToKundenangaben(mitObjekt, { datenkontext: "TEST_MODUS" });
    const immobilie = r.kundenangaben.finanzierungsobjekt!.immobilie!;
    expect(immobilie.typ!["@type"]).toBe("EINFAMILIENHAUS");
    expect(immobilie.adresse).toEqual({
      strasse: "Feldweg",
      hausnummer: "12a",
      plz: "14467",
      ort: "Potsdam",
    });
  });

  it("legt die Wohnflaeche unter gebaeude.nutzung.wohnen.gesamtflaeche ab", () => {
    const r = canonicalToKundenangaben(mitObjekt, { datenkontext: "TEST_MODUS" });
    const typ = r.kundenangaben.finanzierungsobjekt!.immobilie!.typ!;
    expect(typ.gebaeude).toEqual({
      baujahr: 1998,
      nutzung: { wohnen: { gesamtflaeche: 142.5 } },
    });
    expect(typ.grundstuecksgroesse).toBe(620);
  });

  it("nutzt IMMOBILIE_OHNE_TYP fuer Objektarten ohne Europace-Entsprechung", () => {
    const r = canonicalToKundenangaben(fall({ property: { objektart: "gewerbe" } }), {
      datenkontext: "TEST_MODUS",
    });
    expect(r.kundenangaben.finanzierungsobjekt!.immobilie!.typ!["@type"]).toBe("IMMOBILIE_OHNE_TYP");
  });

  it("laesst die Eigentumswohnung ohne Grundstuecksgroesse", () => {
    const r = canonicalToKundenangaben(
      fall({ property: { objektart: "eigentumswohnung", wohnflaeche: 78, grundstuecksflaeche: 500 } }),
      { datenkontext: "TEST_MODUS" }
    );
    const typ = r.kundenangaben.finanzierungsobjekt!.immobilie!.typ!;
    expect(typ["@type"]).toBe("EIGENTUMSWOHNUNG");
    expect(typ.grundstuecksgroesse).toBeUndefined();
  });

  it("bleibt schemakonform", () => {
    const r = canonicalToKundenangaben(mitObjekt, { datenkontext: "TEST_MODUS" });
    expect(validateKundenangabenRequest(r).errors).toEqual([]);
  });
});
