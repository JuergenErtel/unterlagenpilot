import { describe, it, expect } from "vitest";
import {
  computeObjectUpdate,
  parseGermanNumber,
  parsePropertyType,
  isObjectDocumentType,
  type CurrentObjectData,
} from "@/lib/documents/apply-object-fields";
import type { ExtractedFieldLike } from "@/lib/documents/apply-fields";

const empty: CurrentObjectData = { property: null, financing: null };

function f(key: string, label: string, value: string | null): ExtractedFieldLike {
  return { key, label, value };
}

describe("parseGermanNumber", () => {
  it("parst deutsche Beträge mit Tausenderpunkt und Einheit", () => {
    expect(parseGermanNumber("420.000,00 €")).toBe(420000);
    expect(parseGermanNumber("420.000 EUR")).toBe(420000);
    expect(parseGermanNumber("1.234.567")).toBe(1234567);
  });
  it("parst Flächenangaben mit Komma und m²", () => {
    expect(parseGermanNumber("142 m²")).toBe(142);
    expect(parseGermanNumber("142,5 m²")).toBe(142.5);
  });
  it("parst reine Zahlen und englische Dezimalpunkte", () => {
    expect(parseGermanNumber("420000")).toBe(420000);
    expect(parseGermanNumber("142.5")).toBe(142.5);
  });
  it("ignoriert Präfixe wie 'ca.' ohne Fehlparser", () => {
    expect(parseGermanNumber("ca. 350.000 €")).toBe(350000);
  });
  it("gibt undefined für Nicht-Zahlen zurück", () => {
    expect(parseGermanNumber("auf Anfrage")).toBeUndefined();
    expect(parseGermanNumber("")).toBeUndefined();
  });
});

describe("parsePropertyType", () => {
  it("mappt freie Objektart-Texte auf das Enum", () => {
    expect(parsePropertyType("Einfamilienhaus")).toBe("einfamilienhaus");
    expect(parsePropertyType("freistehendes EFH")).toBe("einfamilienhaus");
    expect(parsePropertyType("Eigentumswohnung (ETW)")).toBe("eigentumswohnung");
    expect(parsePropertyType("Doppelhaushälfte")).toBe("doppelhaushaelfte");
    expect(parsePropertyType("Reihenmittelhaus")).toBe("reihenhaus");
    expect(parsePropertyType("Mehrfamilienhaus")).toBe("mehrfamilienhaus");
    expect(parsePropertyType("Baugrundstück")).toBe("grundstueck");
  });
  it("mappt gängige Exposé-Bauformen auf die Bankkategorie", () => {
    // Bungalow/Villa sind für Bank und Europace ein Einfamilienhaus.
    expect(parsePropertyType("Bungalow")).toBe("einfamilienhaus");
    expect(parsePropertyType("Stadtvilla")).toBe("einfamilienhaus");
    expect(parsePropertyType("Penthouse")).toBe("eigentumswohnung");
    expect(parsePropertyType("Maisonette")).toBe("eigentumswohnung");
    // Eine Mehrfamilienvilla bleibt ein Mehrfamilienhaus.
    expect(parsePropertyType("Mehrfamilienvilla")).toBe("mehrfamilienhaus");
  });
  it("gibt undefined bei unklaren Angaben zurück", () => {
    expect(parsePropertyType("Haus")).toBeUndefined();
    expect(parsePropertyType("")).toBeUndefined();
  });
});

describe("isObjectDocumentType", () => {
  it("erkennt Objekt-Dokumente", () => {
    expect(isObjectDocumentType("expose")).toBe(true);
    expect(isObjectDocumentType("kaufvertragsentwurf")).toBe(true);
    expect(isObjectDocumentType("grundbuchauszug")).toBe(true);
    expect(isObjectDocumentType("baukostenaufstellung")).toBe(true);
  });
  it("lehnt Personen-/Einkommensdokumente ab (Mietvertrag-Adresse ≠ Finanzierungsobjekt)", () => {
    expect(isObjectDocumentType("personalausweis")).toBe(false);
    expect(isObjectDocumentType("gehaltsabrechnung")).toBe(false);
    expect(isObjectDocumentType("mietvertrag")).toBe(false);
    expect(isObjectDocumentType("kontoauszug")).toBe(false);
  });
});

describe("computeObjectUpdate", () => {
  it("übernimmt Exposé-Felder in leere Objektdaten + Kaufpreis in den Finanzierungswunsch", () => {
    const { propertyData, financingData, appliedLabels } = computeObjectUpdate(
      [
        f("objektadresse", "Objektadresse", "Musterstraße 12, 76744 Wörth"),
        f("objektart", "Objektart", "einfamilienhaus"),
        f("kaufpreis", "Kaufpreis", "420.000,00 €"),
        f("wohnflaeche", "Wohnfläche (m²)", "142"),
        f("grundstuecksflaeche", "Grundstücksfläche (m²)", "510"),
        f("baujahr", "Baujahr", "1998"),
        f("zimmer", "Anzahl Zimmer", "5"),
        f("heizungsart", "Heizungsart", "Gas-Brennwert"),
      ],
      empty
    );
    expect(propertyData).toEqual({
      objektart: "einfamilienhaus",
      street: "Musterstraße 12",
      zip: "76744",
      city: "Wörth",
      wohnflaeche: 142,
      grundstuecksflaeche: 510,
      baujahr: 1998,
      anzahlZimmer: 5,
      heizungsart: "Gas-Brennwert",
    });
    expect(financingData).toEqual({ kaufpreis: 420000 });
    expect(appliedLabels.length).toBeGreaterThanOrEqual(9);
  });

  it("überschreibt vorhandene Werte NICHT (nur leere füllen)", () => {
    const current: CurrentObjectData = {
      property: { wohnflaeche: 120, street: "Bestandsweg 1" },
      financing: { kaufpreis: 400000 },
    };
    const { propertyData, financingData } = computeObjectUpdate(
      [
        f("objektadresse", "Objektadresse", "Musterstraße 12, 76744 Wörth"),
        f("kaufpreis", "Kaufpreis", "420.000 €"),
        f("wohnflaeche", "Wohnfläche (m²)", "142"),
        f("baujahr", "Baujahr", "1998"),
      ],
      current
    );
    expect(propertyData.wohnflaeche).toBeUndefined();
    expect(propertyData.street).toBeUndefined();
    // PLZ/Ort waren leer → dürfen aus der kombinierten Adresse gefüllt werden.
    expect(propertyData.zip).toBe("76744");
    expect(propertyData.city).toBe("Wörth");
    expect(propertyData.baujahr).toBe(1998);
    expect(financingData.kaufpreis).toBeUndefined();
  });

  it("matcht tolerant über das Label, wenn die echte KI andere Keys liefert", () => {
    const { propertyData, financingData } = computeObjectUpdate(
      [
        f("purchase_price", "Kaufpreis", "350.000 €"),
        f("living_area", "Wohnfläche", "98,5 m²"),
        f("year_built", "Baujahr", "2005"),
      ],
      empty
    );
    expect(financingData.kaufpreis).toBe(350000);
    expect(propertyData.wohnflaeche).toBe(98.5);
    expect(propertyData.baujahr).toBe(2005);
  });

  it("mappt Grundstücksgröße (Grundbuch) auf grundstuecksflaeche und Gesamtbaukosten auf baukosten", () => {
    const { propertyData, financingData } = computeObjectUpdate(
      [
        f("grundstuecksgroesse", "Grundstücksgröße", "623 m²"),
        f("gesamtbaukosten", "Gesamtbaukosten", "480.000 €"),
      ],
      empty
    );
    expect(propertyData.grundstuecksflaeche).toBe(623);
    expect(financingData.baukosten).toBe(480000);
  });

  it("verwirft unplausible Baujahre und unparsbare Werte statt Müll zu übernehmen", () => {
    const { propertyData, financingData, appliedLabels } = computeObjectUpdate(
      [
        f("baujahr", "Baujahr", "98"),
        f("kaufpreis", "Kaufpreis", "auf Anfrage"),
        f("objektart", "Objektart", "Haus"),
      ],
      empty
    );
    expect(propertyData.baujahr).toBeUndefined();
    expect(propertyData.objektart).toBeUndefined();
    expect(financingData.kaufpreis).toBeUndefined();
    expect(appliedLabels).toHaveLength(0);
  });

  it("übernimmt ein echtes ImmoScout-Exposé: Adresse in Einzelteilen, Bauform, Nebenflächen", () => {
    // Feld-Keys 1:1 aus dem Exposé im Fall UP-2026-0007 (Bungalow, Wörth am Rhein).
    const { propertyData, financingData } = computeObjectUpdate(
      [
        f("objekt_typ", "Objekt-Typ", "Bungalow"),
        f("postleitzahl", "Postleitzahl", "76744"),
        f("ort", "Ort", "Wörth am Rhein"),
        f("nutzflaeche", "Nutzfläche (ca.)", "195.1"),
        f("objektzustand", "Objektzustand", "Gepflegt"),
        f("anzahl_garage_stellplatz", "Anzahl Garage/Stellplatz", "3"),
        f("kaufpreis", "Kaufpreis", "895000"),
        // Der Makler ist nicht das Objekt – seine Adresse darf nie einfließen.
        f("anbieter_adresse", "Anbieter Adresse", "Wormser Straße 13, 67346 Speyer"),
        f("anbieter_firma", "Anbieter Firma", "RIEGEL Immobilien"),
      ],
      empty
    );
    expect(propertyData.objektart).toBe("einfamilienhaus");
    expect(propertyData.zip).toBe("76744");
    expect(propertyData.city).toBe("Wörth am Rhein");
    expect(propertyData.street).toBeUndefined();
    expect(propertyData.nutzflaeche).toBe(195.1);
    expect(propertyData.zustand).toBe("Gepflegt");
    expect(propertyData.stellplaetze).toBe(3);
    expect(financingData.kaufpreis).toBe(895000);
  });

  it("übernimmt Straße/PLZ/Ort auch als getrennte Felder", () => {
    const { propertyData } = computeObjectUpdate(
      [
        f("strasse", "Straße", "Musterstraße 12"),
        f("plz", "PLZ", "76744"),
        f("stadt", "Stadt", "Wörth"),
      ],
      empty
    );
    expect(propertyData).toEqual({ street: "Musterstraße 12", zip: "76744", city: "Wörth" });
  });

  it("übernimmt Hausgeld, Mieteinnahmen und Wohneinheiten – aber keine Jahresangabe als Monatswert", () => {
    const monatlich = computeObjectUpdate(
      [
        f("hausgeld", "Hausgeld", "320 €"),
        f("mieteinnahmen", "Mieteinnahmen monatlich", "1.450 €"),
        f("wohneinheiten", "Anzahl Wohneinheiten", "4"),
      ],
      empty
    );
    expect(monatlich.propertyData.hausgeldMonatlich).toBe(320);
    expect(monatlich.propertyData.mieteinnahmenMonatlich).toBe(1450);
    expect(monatlich.propertyData.anzahlWohneinheiten).toBe(4);

    const jaehrlich = computeObjectUpdate(
      [f("mieteinnahmen_jahr", "Mieteinnahmen jährlich", "17.400 €")],
      empty
    );
    expect(jaehrlich.propertyData.mieteinnahmenMonatlich).toBeUndefined();
  });

  it("hält den Quadratmeterpreis vom Kaufpreis fern – auch wenn er zuerst kommt", () => {
    const { financingData } = computeObjectUpdate(
      [
        f("kaufpreis_pro_m2", "Kaufpreis pro m²", "3688"),
        f("kaufpreis", "Kaufpreis", "895000"),
      ],
      empty
    );
    expect(financingData.kaufpreis).toBe(895000);

    // Ohne echten Kaufpreis bleibt das Feld leer statt den m²-Preis zu erben.
    const nurQm = computeObjectUpdate([f("kaufpreis_pro_m2", "Kaufpreis pro m²", "3688")], empty);
    expect(nurQm.financingData.kaufpreis).toBeUndefined();
  });

  it("verwirft krumme Stückzahlen statt sie zu runden", () => {
    const { propertyData } = computeObjectUpdate(
      [f("stellplaetze", "Stellplätze", "1,5"), f("wohneinheiten", "Wohneinheiten", "2,5")],
      empty
    );
    expect(propertyData.stellplaetze).toBeUndefined();
    expect(propertyData.anzahlWohneinheiten).toBeUndefined();
  });

  it("ignoriert leere Werte und liefert leere Updates ohne Treffer", () => {
    const { propertyData, financingData, appliedLabels } = computeObjectUpdate(
      [f("kaufpreis", "Kaufpreis", null), f("notar", "Notar", "Dr. Meier")],
      empty
    );
    expect(propertyData).toEqual({});
    expect(financingData).toEqual({});
    expect(appliedLabels).toHaveLength(0);
  });
});
