import { describe, it, expect } from "vitest";
import { berechneReife } from "@/lib/erstgespraech/reife";

const leer = { applicants: [{ position: 1 }], property: null, financingRequest: null, caseFelder: {} };

describe("Angebotsreife", () => {
  it("zaehlt bei einem leeren Fall nichts als gefuellt", () => {
    const r = berechneReife(leer, 1);
    expect(r.gefuellt).toBe(0);
    expect(r.gesamt).toBeGreaterThan(15);
  });

  it("zaehlt personenbezogene Felder je Antragsteller doppelt", () => {
    const einer = berechneReife(leer, 1).gesamt;
    const zwei = berechneReife(
      { ...leer, applicants: [{ position: 1 }, { position: 2 }] },
      2
    ).gesamt;
    expect(zwei).toBeGreaterThan(einer);
  });

  it("erkennt gefuellte Felder ueber alle Entitaeten", () => {
    const r = berechneReife(
      {
        applicants: [{ position: 1, vorname: "Mo", nachname: "Lahwani", geburtsdatum: new Date("1987-09-18") }],
        property: { objektart: "einfamilienhaus", wohnflaeche: 242.7 },
        financingRequest: { kaufpreis: 895000, zinsbindungJahre: 15 },
        caseFelder: { financingType: "kauf" },
      },
      1
    );
    const gefuellt = r.felder.filter((f) => f.gefuellt).map((f) => f.schluessel);
    expect(gefuellt).toContain("kaufpreis");
    expect(gefuellt).toContain("zinsbindungJahre");
    expect(gefuellt).toContain("objektart");
  });

  it("wertet 0 und false als gefuellt, nur null/leer als Luecke", () => {
    // Eine Wunschrate von 0 ist unsinnig, aber "keine Sondertilgung
    // gewuenscht" (false) ist eine ANTWORT und darf nicht als Luecke zaehlen.
    const r = berechneReife(
      { ...leer, financingRequest: { sondertilgungGewuenscht: false, maklerprovisionProzent: 0 } },
      1
    );
    const gefuellt = r.felder.filter((f) => f.gefuellt).map((f) => f.schluessel);
    expect(gefuellt).toContain("sondertilgungGewuenscht");
    expect(gefuellt).toContain("maklerprovisionProzent");
  });

  it("zaehlt Probezeit und Befristung als gefuellt, sobald ein Beschaeftigungssatz die Vorgabe 'nein' traegt", () => {
    // Beide Spalten sind NOT NULL mit Vorgabe false ("nein") – die Vorbelegung
    // IST die Antwort (Entscheidung des Vermittlers vom 13.08.2026). Sobald
    // ein employment-Satz existiert (z. B. weil die Beschaeftigungsart schon
    // beantwortet wurde), tragen beide Spalten also den Schema-Standard false
    // und zaehlen zu Recht als beantwortet – kein Datum noetig.
    const r = berechneReife(
      {
        ...leer,
        applicants: [{ position: 1, employment: [{ inProbezeit: false, befristet: false }] }],
      },
      1
    );
    const gefuellt = r.felder.filter((f) => f.gefuellt).map((f) => f.schluessel);
    expect(gefuellt).toContain("inProbezeit");
    expect(gefuellt).toContain("befristet");
  });
});
