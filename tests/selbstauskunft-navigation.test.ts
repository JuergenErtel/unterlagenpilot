import { describe, it, expect } from "vitest";
import {
  sichtbareSchritte,
  naechsterSchritt,
  vorherigerSchritt,
  fortschritt,
  schluessel,
  personenSchluessel,
} from "@/lib/self-disclosure/navigation";
import type { Antworten } from "@/lib/self-disclosure/types";

const leer: Antworten = {};

describe("Katalog-Navigation", () => {
  it("beginnt mit der Finanzierungsart", () => {
    expect(sichtbareSchritte(leer)[0]!.id).toBe("finanzierungsart");
  });

  it("zeigt den Kaufpreis nur im Kaufzweig", () => {
    const kauf = { "finanzierungsart.art": "kauf_bestand" };
    const modernisierung = { "finanzierungsart.art": "modernisierung" };
    const ids = (a: Antworten) => sichtbareSchritte(a).map((s) => s.id);
    expect(ids(kauf)).toContain("kaufpreis");
    expect(ids(modernisierung)).not.toContain("kaufpreis");
    expect(ids(modernisierung)).toContain("modernisierungskosten");
  });

  it("nimmt ohne Angabe zur Finanzierungsart den Kaufzweig", () => {
    // Ausnahme von der Regel "unbeantwortet -> Zweig zu": ohne den Kaufzweig
    // bliebe fast nichts übrig.
    expect(sichtbareSchritte(leer).map((s) => s.id)).toContain("kaufpreis");
  });

  it("überspringt die Höhe der Maklergebühr, solange keine anfällt", () => {
    const ids = (a: Antworten) => sichtbareSchritte(a).map((s) => s.id);
    expect(ids({ "maklergebuehr.faellt_an": "nein" })).not.toContain("maklergebuehr_hoehe");
    expect(ids({ "maklergebuehr.faellt_an": "ja" })).toContain("maklergebuehr_hoehe");
  });

  it("hält den Zweig zu, wenn die Steuerfrage übersprungen wurde", () => {
    expect(sichtbareSchritte(leer).map((s) => s.id)).not.toContain("maklergebuehr_hoehe");
  });

  it("liefert den nächsten und vorherigen Schritt entlang der sichtbaren Kette", () => {
    const a: Antworten = { "finanzierungsart.art": "kauf_bestand" };
    const nach = naechsterSchritt("finanzierungsart", a);
    expect(nach!.id).toBe("objektstand");
    expect(vorherigerSchritt(nach!.id, a)!.id).toBe("finanzierungsart");
  });

  it("gibt am Ende der Kette null zurück", () => {
    const a: Antworten = {};
    const letzter = sichtbareSchritte(a).at(-1)!;
    expect(naechsterSchritt(letzter.id, a)).toBeNull();
    expect(vorherigerSchritt(sichtbareSchritte(a)[0]!.id, a)).toBeNull();
  });

  it("zählt den Fortschritt über die tatsächlich sichtbaren Schritte", () => {
    const a: Antworten = { "finanzierungsart.art": "kauf_bestand" };
    const f = fortschritt("objektstand", a);
    expect(f.position).toBe(2);
    expect(f.gesamt).toBe(sichtbareSchritte(a).length);
  });

  it("baut Antwortschlüssel aus Schritt und Feld", () => {
    expect(schluessel("finanzierungsart", "art")).toBe("finanzierungsart.art");
  });
});

describe("Personen-Spalten", () => {
  it("erzeugt EINEN Schritt mit zwei Spalten statt zweier Schritte", () => {
    // Der Kern dieser Aufgabe: Ein Paar sitzt gemeinsam am Rechner und
    // erwartet beide nebeneinander, nicht erst ihn und dann sie.
    const kette = sichtbareSchritte({ "anzahl_antragsteller.anzahl": "2" });
    const personenschritte = kette.filter((s) => s.schritt.personenSpalten);
    expect(personenschritte.length).toBeGreaterThan(0);
    for (const s of personenschritte) {
      expect(s.personen).toEqual([1, 2]);
      expect(s.id).not.toContain("p1.");
    }
  });

  it("zeigt bei einem Antragsteller nur eine Spalte", () => {
    const kette = sichtbareSchritte({});
    for (const s of kette.filter((x) => x.schritt.personenSpalten)) {
      expect(s.personen).toEqual([1]);
    }
  });

  it("baut den Schluessel weiterhin mit Personen-Praefix", () => {
    // Die Schluesselform bleibt: Uebernahme, Vorbelegung und Pflichtangaben
    // lesen sie so. Nur der Praefix wandert aus der Schritt-ID in den Bau.
    expect(personenSchluessel("person_name", "nachname", 1)).toBe("p1.person_name.nachname");
    expect(personenSchluessel("person_name", "nachname", 2)).toBe("p2.person_name.nachname");
    expect(personenSchluessel("kaufpreis", "betrag")).toBe("kaufpreis.betrag");
  });

  it("zaehlt die Kette kuerzer, weil Personenschritte nicht mehr doppeln", () => {
    const einer = sichtbareSchritte({}).length;
    const zwei = sichtbareSchritte({ "anzahl_antragsteller.anzahl": "2" }).length;
    expect(zwei).toBe(einer);
  });
});
