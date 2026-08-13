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

/**
 * Nicht jede Angabe gibt es in jedem Fall.
 *
 * Eine Eigentumswohnung hat kein Grundstueck, ein unbebautes Grundstueck weder
 * Wohnflaeche noch Baujahr, und bei einer Anschlussfinanzierung wird nichts
 * gekauft – also gibt es weder Kaufpreis noch Maklerprovision. Wurden sie
 * trotzdem gezaehlt, konnte die Reifeleiste in genau diesen Faellen nie voll
 * werden und mahnte eine Angabe an, die es nicht gibt.
 *
 * Dieselbe Schutzregel wie bei der Beschaeftigungsart: Solange Objektart bzw.
 * Finanzierungsart LEER sind, zaehlt alles mit – sonst verschwaende eine Frage,
 * bevor der Vermittler ueberhaupt gefragt hat.
 */
describe("Angaben haengen an Objektart und Finanzierungsart", () => {
  const schluessel = (property: Record<string, unknown> | null, financingType: string | null) =>
    berechneReife({ ...leer, property, caseFelder: { financingType } }, 1).felder.map(
      (f) => f.schluessel
    );

  it("fragt bei einer Eigentumswohnung nicht nach der Grundstuecksgroesse", () => {
    expect(schluessel({ objektart: "eigentumswohnung" }, "kauf")).not.toContain("grundstuecksflaeche");
  });

  it("fragt bei einem Haus sehr wohl danach", () => {
    for (const art of ["einfamilienhaus", "doppelhaushaelfte", "reihenhaus", "mehrfamilienhaus"]) {
      expect(schluessel({ objektart: art }, "kauf"), art).toContain("grundstuecksflaeche");
    }
  });

  it("fragt bei einem unbebauten Grundstueck weder nach Wohnflaeche noch Baujahr", () => {
    const s = schluessel({ objektart: "grundstueck" }, "kauf");
    expect(s).not.toContain("wohnflaeche");
    expect(s).not.toContain("baujahr");
    expect(s).toContain("grundstuecksflaeche");
  });

  it("fragt ohne Kauf weder nach Kaufpreis noch nach Maklerprovision", () => {
    for (const art of ["anschlussfinanzierung", "umschuldung", "modernisierung", "kapitalbeschaffung"]) {
      const s = schluessel(null, art);
      expect(s, art).not.toContain("kaufpreis");
      expect(s, art).not.toContain("maklerprovisionProzent");
    }
  });

  it("fragt bei Kauf und Neubau nach beidem", () => {
    // Provisionsfrei ist hier eine 0, keine ausgeblendete Zeile: Innerhalb des
    // Kaufzweigs bleibt die Frage stehen, auch beim Bautraeger-Neubau.
    for (const art of ["kauf", "neubau"]) {
      const s = schluessel(null, art);
      expect(s, art).toContain("kaufpreis");
      expect(s, art).toContain("maklerprovisionProzent");
    }
  });

  it("zaehlt alles mit, solange Objektart und Finanzierungsart leer sind", () => {
    const s = schluessel(null, null);
    for (const feld of ["grundstuecksflaeche", "wohnflaeche", "baujahr", "kaufpreis", "maklerprovisionProzent"]) {
      expect(s, feld).toContain(feld);
    }
  });
});
