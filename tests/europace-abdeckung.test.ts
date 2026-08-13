import { describe, it, expect } from "vitest";
import { erreichtEuropaceNie } from "@/lib/erstgespraech/europace-abdeckung";
import { canonicalToKundenangaben } from "@/lib/platforms/europace/kundenangaben-mapping";
import type { CanonicalCase } from "@/lib/domain/canonical";

/**
 * Fund A2 (Schlusspruefung 12.08.2026): Die Uebergabe-Kopiermaske
 * (`uebergabe.tsx`) zeigt alle 26 Reife-Angaben direkt ueber dem
 * "An Europace uebertragen"-Knopf, aber acht davon erreicht das Mapping nie.
 * `erreichtEuropaceNie` ist die (handgepflegte) Grundlage der sichtbaren
 * Markierung in der Maske. Dieser Test prueft sie NICHT nur gegen sich
 * selbst, sondern differenziell gegen `canonicalToKundenangaben`: Aendert
 * sich der Request, wenn nur dieses eine Feld variiert? Wenn nicht, ist das
 * Feld zu Recht als "erreicht Europace nie" markiert.
 */

function basisfall(): CanonicalCase {
  return {
    caseNumber: "UP-2026-0001",
    financingType: "kauf",
    applicants: [
      {
        position: 1,
        vorname: "Max",
        nachname: "Muster",
        geburtsdatum: "1985-01-01",
        staatsangehoerigkeit: "deutsch",
        familienstand: "verheiratet",
        anzahlKinder: 2,
        strasse: "Musterstr. 1",
        plz: "12345",
        ort: "Musterstadt",
      },
    ],
    employment: [
      { applicantPosition: 1, beschaeftigungsart: "angestellter", inProbezeit: false, befristet: false },
    ],
    income: [{ applicantPosition: 1, nettoMonatlich: 3000, sonstigeEinnahmen: 200 }],
    liabilities: [],
    assets: [],
    property: {
      objektart: "einfamilienhaus",
      strasse: "Feldweg 2",
      plz: "54321",
      ort: "Musterstadt",
      wohnflaeche: 120,
      grundstuecksflaeche: 400,
      baujahr: 2000,
      nutzung: "selbstnutzung",
    },
    financing: {
      finanzierungsart: "kauf",
      kaufpreis: 400000,
      maklerprovisionProzent: 3.57,
      eigenkapital: 50000,
      darlehenswunsch: 350000,
      zinsbindungJahre: 10,
      sondertilgungGewuenscht: true,
      wunschrateMonatlich: 1500,
    },
    platformIds: {},
  };
}

function request(c: CanonicalCase): string {
  return JSON.stringify(canonicalToKundenangaben(c, { datenkontext: "TEST_MODUS" }));
}

describe("erreichtEuropaceNie – Deckung mit dem tatsaechlichen Mapping", () => {
  const basis = request(basisfall());

  it("befristet veraendert den Request nicht", () => {
    const c = basisfall();
    c.employment[0]!.befristet = true;
    expect(request(c)).toBe(basis);
    expect(erreichtEuropaceNie("befristet", true)).toBe(true);
  });

  it("sonstigeEinnahmen veraendert den Request nicht", () => {
    const c = basisfall();
    c.income[0]!.sonstigeEinnahmen = 9999;
    expect(request(c)).toBe(basis);
    expect(erreichtEuropaceNie("sonstigeEinnahmen", 9999)).toBe(true);
  });

  it("anzahlKinder veraendert den Request nicht", () => {
    const c = basisfall();
    c.applicants[0]!.anzahlKinder = 5;
    expect(request(c)).toBe(basis);
    expect(erreichtEuropaceNie("anzahlKinder", 5)).toBe(true);
  });

  it("Objekt-Nutzung veraendert den Request nicht", () => {
    const c = basisfall();
    c.property!.nutzung = "vermietet";
    expect(request(c)).toBe(basis);
    expect(erreichtEuropaceNie("nutzung", "vermietet")).toBe(true);
  });

  it("zinsbindungJahre veraendert den Request nicht", () => {
    const c = basisfall();
    c.financing.zinsbindungJahre = 20;
    expect(request(c)).toBe(basis);
    expect(erreichtEuropaceNie("zinsbindungJahre", 20)).toBe(true);
  });

  it("sondertilgungGewuenscht veraendert den Request nicht", () => {
    const c = basisfall();
    c.financing.sondertilgungGewuenscht = false;
    expect(request(c)).toBe(basis);
    expect(erreichtEuropaceNie("sondertilgungGewuenscht", false)).toBe(true);
  });

  it("wunschrateMonatlich veraendert den Request nicht", () => {
    const c = basisfall();
    c.financing.wunschrateMonatlich = 2500;
    expect(request(c)).toBe(basis);
    expect(erreichtEuropaceNie("wunschrateMonatlich", 2500)).toBe(true);
  });

  it("inProbezeit=false veraendert den Request nicht, inProbezeit=true dagegen schon", () => {
    const cFalse = basisfall();
    cFalse.employment[0]!.inProbezeit = false;
    expect(request(cFalse)).toBe(basis);
    expect(erreichtEuropaceNie("inProbezeit", false)).toBe(true);

    const cTrue = basisfall();
    cTrue.employment[0]!.inProbezeit = true;
    expect(request(cTrue)).not.toBe(basis);
    expect(erreichtEuropaceNie("inProbezeit", true)).toBe(false);
  });

  // Gegenprobe: fuer tatsaechlich uebertragene Felder MUSS sich der Request
  // aendern – sonst waere die Differenzmethode selbst blind (falsch-negativ).
  it("Kontrollgruppe: transferierte Felder veraendern den Request tatsaechlich", () => {
    const kaufpreis = basisfall();
    kaufpreis.financing.kaufpreis = 999999;
    expect(request(kaufpreis)).not.toBe(basis);
    expect(erreichtEuropaceNie("kaufpreis", 999999)).toBe(false);

    const wohnflaeche = basisfall();
    wohnflaeche.property!.wohnflaeche = 200;
    expect(request(wohnflaeche)).not.toBe(basis);
    expect(erreichtEuropaceNie("wohnflaeche", 200)).toBe(false);

    const vorname = basisfall();
    vorname.applicants[0]!.vorname = "Erika";
    expect(request(vorname)).not.toBe(basis);
    expect(erreichtEuropaceNie("vorname", "Erika")).toBe(false);
  });
});
