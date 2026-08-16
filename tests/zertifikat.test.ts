import { describe, it, expect } from "vitest";
import {
  zertifikatFehlendeAngaben,
  zertifikatErzeugbar,
  objektZeile,
  namensZeile,
  bescheinigungsSatz,
  euroGanz,
  type ZertifikatEingabe,
} from "@/lib/pdf/zertifikat";

function eingabe(teil: Partial<ZertifikatEingabe> = {}): ZertifikatEingabe {
  return {
    kaufpreis: 210_000,
    objektStrasse: "An der Bergwiese 1",
    objektPlz: "65307",
    objektOrt: "Bad Schwalbach",
    antragsteller: [{ vorname: "Philipp", nachname: "Schmidt" }],
    ...teil,
  };
}

describe("Zertifikat – wann es erzeugt werden darf", () => {
  it("gibt einen vollständigen Fall frei", () => {
    expect(zertifikatFehlendeAngaben(eingabe())).toEqual([]);
    expect(zertifikatErzeugbar(eingabe())).toBe(true);
  });

  it("verlangt einen Kaufpreis", () => {
    expect(zertifikatFehlendeAngaben(eingabe({ kaufpreis: null }))).toContain("Kaufpreis");
  });

  it("lässt eine Null nicht als Kaufpreis durchgehen", () => {
    // Eine 0 ist kein Preis, sondern ein leer gelassenes Feld. Ein Zertifikat
    // über „0 Euro" wäre der peinlichste denkbare Ausgang.
    expect(zertifikatFehlendeAngaben(eingabe({ kaufpreis: 0 }))).toContain("Kaufpreis");
  });

  it("verlangt eine Objektadresse", () => {
    // Jürgens Entscheidung vom 16.08.2026: wie bei FinLink kein Zertifikat
    // ohne konkretes Objekt.
    expect(zertifikatFehlendeAngaben(eingabe({ objektStrasse: null }))).toContain("Objektadresse");
    expect(zertifikatFehlendeAngaben(eingabe({ objektOrt: null }))).toContain("Objektadresse");
  });

  it("lässt eine Postleitzahl allein nicht als Adresse gelten", () => {
    const fehlt = zertifikatFehlendeAngaben(
      eingabe({ objektStrasse: "   ", objektOrt: "  ", objektPlz: "76744" })
    );
    expect(fehlt).toContain("Objektadresse");
  });

  it("verlangt mindestens einen Namen", () => {
    const fehlt = zertifikatFehlendeAngaben(
      eingabe({ antragsteller: [{ vorname: null, nachname: null }] })
    );
    expect(fehlt).toContain("Name des Antragstellers");
  });

  it("nennt mehrere fehlende Angaben auf einmal", () => {
    // Der gesperrte Knopf soll alles auflisten, was fehlt – sonst arbeitet
    // sich der Vermittler einzeln durch.
    const fehlt = zertifikatFehlendeAngaben(
      eingabe({ kaufpreis: null, objektStrasse: null, antragsteller: [] })
    );
    expect(fehlt).toEqual(["Kaufpreis", "Objektadresse", "Name des Antragstellers"]);
  });
});

describe("Zertifikat – die Zeilen auf dem Papier", () => {
  it("setzt die Objektadresse wie im Vorbild", () => {
    expect(objektZeile(eingabe())).toBe("An der Bergwiese 1, 65307 Bad Schwalbach");
  });

  it("lässt eine fehlende Postleitzahl weg, statt eine Lücke zu lassen", () => {
    expect(objektZeile({ objektStrasse: "Ottstr. 9", objektPlz: null, objektOrt: "Wörth" })).toBe(
      "Ottstr. 9, Wörth"
    );
  });

  it("nennt einen Antragsteller", () => {
    expect(namensZeile([{ vorname: "Philipp", nachname: "Schmidt" }])).toBe("Philipp Schmidt");
  });

  it("verbindet zwei Antragsteller mit „und“", () => {
    expect(
      namensZeile([
        { vorname: "Mate", nachname: "Topcic" },
        { vorname: "Jadranka", nachname: "Topcic" },
      ])
    ).toBe("Mate Topcic und Jadranka Topcic");
  });

  it("übergeht einen namenlosen zweiten Antragsteller", () => {
    // Sonst lautete das Papier auf „Mate Topcic und " – so etwas gibt niemand
    // aus der Hand.
    expect(
      namensZeile([
        { vorname: "Mate", nachname: "Topcic" },
        { vorname: null, nachname: null },
      ])
    ).toBe("Mate Topcic");
  });

  it("beugt den Bescheinigungssatz nach Personenzahl", () => {
    expect(bescheinigungsSatz(1)).toContain("der unten genannten Person –");
    expect(bescheinigungsSatz(2)).toContain("der unten genannten Personen –");
  });

  it("schreibt die große Zahl ohne Cent, mit Tausenderpunkt", () => {
    expect(euroGanz(210000)).toBe("210.000 Euro");
    expect(euroGanz(419999.6)).toBe("420.000 Euro");
  });
});
