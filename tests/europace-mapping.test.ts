import { describe, expect, it } from "vitest";
import { canonicalToKundenangaben } from "@/lib/platforms/europace/kundenangaben-mapping";
import type { CanonicalCase } from "@/lib/domain/canonical";
import { FINANCING_TYPES, PROPERTY_TYPES } from "@/lib/domain/enums";
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

  it("mappt Beschaeftigung als ANGESTELLTER mit Arbeitgeber", () => {
    const r = canonicalToKundenangaben(angestellt, { datenkontext: "TEST_MODUS" });
    const finanzielles = r.kundenangaben.haushalte![0]!.kunden![0]!.finanzielles!;
    expect(finanzielles.einkommenNetto).toBe(3200);
    expect(finanzielles.beschaeftigung).toEqual({
      "@type": "ANGESTELLTER",
      beruf: "Projektleiterin",
      beschaeftigungsverhaeltnis: {
        arbeitgeber: { name: "Beispiel GmbH" },
        beschaeftigtSeit: "2019-03-01",
      },
    });
  });

  it("laesst probezeit weg, wenn inProbezeit false ist: die DB-Spalte ist ein nicht-nullables Boolean mit Default false, also nicht von 'nie erfasst' unterscheidbar", () => {
    const r = canonicalToKundenangaben(angestellt, { datenkontext: "TEST_MODUS" });
    const verhaeltnis = r.kundenangaben.haushalte![0]!.kunden![0]!.finanzielles!.beschaeftigung!
      .beschaeftigungsverhaeltnis!;
    // Bewusst toBeUndefined statt not.toHaveProperty: das Objekt traegt den
    // Schluessel `probezeit` durchaus (mit Wert undefined) -- JSON.stringify
    // laesst ihn beim Senden ohnehin weg, aber toHaveProperty saehe ihn als
    // vorhanden an.
    expect(verhaeltnis.probezeit).toBeUndefined();
  });

  it("sendet probezeit:true, weil ein wahrer Wert nur aus einer expliziten Antwort (Selbstauskunft) stammen kann", () => {
    const r = canonicalToKundenangaben(
      fall({
        applicants: [{ position: 1, vorname: "Cem", nachname: "Yildiz" }],
        employment: [
          {
            applicantPosition: 1,
            beschaeftigungsart: "angestellter",
            arbeitgeber: "Beispiel GmbH",
            inProbezeit: true,
          },
        ],
      }),
      { datenkontext: "TEST_MODUS" }
    );
    const verhaeltnis = r.kundenangaben.haushalte![0]!.kunden![0]!.finanzielles!.beschaeftigung!
      .beschaeftigungsverhaeltnis!;
    expect(verhaeltnis.probezeit).toBe(true);
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

  it("behaelt die Grundstuecksflaeche bei IMMOBILIE_OHNE_TYP (Gewerbe/Sonstiges) statt sie wegzuwerfen", () => {
    const r = canonicalToKundenangaben(
      fall({ property: { objektart: "gewerbe", grundstuecksflaeche: 300 } }),
      { datenkontext: "TEST_MODUS" }
    );
    const typ = r.kundenangaben.finanzierungsobjekt!.immobilie!.typ!;
    expect(typ["@type"]).toBe("IMMOBILIE_OHNE_TYP");
    expect(typ.grundstuecksgroesse).toBe(300);
    expect(validateKundenangabenRequest(r).errors).toEqual([]);
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

  it("laesst ein Baugrundstueck ohne gebaeude, obwohl baujahr und wohnflaeche gesetzt sind", () => {
    const r = canonicalToKundenangaben(
      fall({
        property: {
          objektart: "grundstueck",
          baujahr: 2020,
          wohnflaeche: 100,
          grundstuecksflaeche: 800,
        },
      }),
      { datenkontext: "TEST_MODUS" }
    );
    const typ = r.kundenangaben.finanzierungsobjekt!.immobilie!.typ!;
    expect(typ["@type"]).toBe("BAUGRUNDSTUECK");
    expect(typ.gebaeude).toBeUndefined();
    expect(typ.grundstuecksgroesse).toBe(800);
    expect(validateKundenangabenRequest(r).errors).toEqual([]);
  });

  it.each(PROPERTY_TYPES)(
    "bleibt fuer Objektart '%s' mit vollstaendigen Objektdaten schemakonform",
    (objektart) => {
      const r = canonicalToKundenangaben(
        fall({
          property: {
            objektart,
            strasse: "Feldweg 12a",
            plz: "14467",
            ort: "Potsdam",
            wohnflaeche: 142.5,
            baujahr: 1998,
            grundstuecksflaeche: 620,
          },
        }),
        { datenkontext: "TEST_MODUS" }
      );
      expect(validateKundenangabenRequest(r).errors).toEqual([]);
    }
  );
});

describe("canonicalToKundenangaben – Finanzierungsbedarf", () => {
  const kauffall = fall({
    applicants: [{ position: 1, vorname: "Anna", nachname: "Muster" }],
    financing: {
      finanzierungsart: "kauf",
      kaufpreis: 450_000,
      nebenkosten: 40_000,
      maklerprovisionProzent: 3.57,
      eigenkapital: 90_000,
      darlehenswunsch: 400_000,
    },
  });

  it("mappt den Zweck als KAUF mit Kaufpreis", () => {
    const r = canonicalToKundenangaben(kauffall, { datenkontext: "TEST_MODUS" });
    const zweck = r.kundenangaben.finanzierungsbedarf!.finanzierungszweck!;
    expect(zweck["@type"]).toBe("KAUF");
    expect(zweck.kaufpreis).toBe(450_000);
  });

  it("mappt die Maklerprovision als Prozentwert", () => {
    const r = canonicalToKundenangaben(kauffall, { datenkontext: "TEST_MODUS" });
    expect(r.kundenangaben.finanzierungsbedarf!.finanzierungszweck!.nebenkosten).toEqual({
      maklergebuehr: { einheit: "PROZENT", wert: 3.57 },
    });
  });

  it("behaelt die Maklerprovision beim Neubau, obwohl der keinen Kaufpreis kennt", () => {
    const r = canonicalToKundenangaben(
      fall({
        financing: {
          finanzierungsart: "neubau",
          kaufpreis: 450_000,
          maklerprovisionProzent: 3.57,
        },
      }),
      { datenkontext: "TEST_MODUS" }
    );
    const zweck = r.kundenangaben.finanzierungsbedarf!.finanzierungszweck!;
    expect(zweck["@type"]).toBe("NEUBAU");
    expect(zweck.kaufpreis).toBeUndefined();
    expect(zweck.nebenkosten).toEqual({ maklergebuehr: { einheit: "PROZENT", wert: 3.57 } });
  });

  it("macht aus dem Darlehenswunsch ein Annuitaetendarlehen", () => {
    const r = canonicalToKundenangaben(kauffall, { datenkontext: "TEST_MODUS" });
    expect(r.kundenangaben.finanzierungsbedarf!.finanzierungsbausteine).toEqual([
      { "@type": "ANNUITAETENDARLEHEN", darlehensbetrag: 400_000 },
    ]);
  });

  it("legt das Eigenkapital als Bank- und Sparguthaben im Haushalt ab", () => {
    const r = canonicalToKundenangaben(kauffall, { datenkontext: "TEST_MODUS" });
    expect(r.kundenangaben.haushalte![0]!.finanzielleSituation).toEqual({
      vermoegen: { summeBankUndSparguthaben: { guthaben: 90_000 } },
    });
  });

  it("mappt die Anschlussfinanzierung auf ihren eigenen Zweck", () => {
    const r = canonicalToKundenangaben(
      fall({ financing: { finanzierungsart: "anschlussfinanzierung", darlehenswunsch: 210_000 } }),
      { datenkontext: "TEST_MODUS" }
    );
    const zweck = r.kundenangaben.finanzierungsbedarf!.finanzierungszweck!;
    expect(zweck["@type"]).toBe("ANSCHLUSSFINANZIERUNG");
    expect(zweck.kaufpreis).toBeUndefined();
  });

  it("laesst den Zweck weg, wenn die Finanzierungsart unbekannt ist", () => {
    const r = canonicalToKundenangaben(fall({ financing: { darlehenswunsch: 100_000 } }), {
      datenkontext: "TEST_MODUS",
    });
    expect(r.kundenangaben.finanzierungsbedarf!.finanzierungszweck).toBeUndefined();
    expect(r.kundenangaben.finanzierungsbedarf!.finanzierungsbausteine).toHaveLength(1);
  });

  it("bleibt schemakonform", () => {
    const r = canonicalToKundenangaben(kauffall, { datenkontext: "TEST_MODUS" });
    expect(validateKundenangabenRequest(r).errors).toEqual([]);
  });

  it.each(FINANCING_TYPES)(
    "bleibt fuer Finanzierungsart '%s' mit vollstaendigen Bedarfsdaten schemakonform",
    (finanzierungsart) => {
      const r = canonicalToKundenangaben(
        fall({
          applicants: [{ position: 1, vorname: "Anna", nachname: "Muster" }],
          financing: {
            finanzierungsart,
            kaufpreis: 450_000,
            nebenkosten: 40_000,
            maklerprovisionProzent: 3.57,
            eigenkapital: 90_000,
            darlehenswunsch: 400_000,
          },
        }),
        { datenkontext: "TEST_MODUS" }
      );
      expect(validateKundenangabenRequest(r).errors).toEqual([]);
    }
  );
});

describe("canonicalToKundenangaben – Freiberufler", () => {
  it("sendet FREIBERUFLER als eigenen Typ – das Schema kennt ihn", () => {
    const r = canonicalToKundenangaben(
      fall({
        applicants: [{ position: 1, vorname: "Mo", nachname: "Lahwani" }],
        employment: [{ applicantPosition: 1, beschaeftigungsart: "freiberufler" }],
      }),
      { datenkontext: "TEST_MODUS" }
    );
    const kunde = r.kundenangaben.haushalte![0]!.kunden![0]!;
    expect(kunde.finanzielles?.beschaeftigung?.["@type"]).toBe("FREIBERUFLER");
  });
});
