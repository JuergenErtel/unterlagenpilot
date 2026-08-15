import { describe, it, expect } from "vitest";
import {
  sichtbareSchritte,
  schrittFinden,
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

  it("gibt dem gemischten Paar nur die Berufsfrage, die zur jeweiligen Person passt", () => {
    // Fund der Prüfung: `personen` ist eine ECHTE Teilmenge, berechnet über
    // `schritt.sichtbar(antworten, person)` je Person – nicht mehr blind
    // [1,2] oder [1]. Sonst würde die Selbstständige (Person 2) nach
    // Arbeitgeber gefragt (falsche Felder) und ihre Firmendaten nie erhoben.
    const gemischt = sichtbareSchritte({
      "anzahl_antragsteller.anzahl": "2",
      "p1.beruf_art.art": "angestellter",
      "p2.beruf_art.art": "selbststaendiger",
    });
    expect(gemischt.find((s) => s.id === "beruf_arbeitgeber")?.personen).toEqual([1]);
    expect(gemischt.find((s) => s.id === "beruf_selbststaendig")?.personen).toEqual([2]);
  });
});

describe("Alte currentStep-Werte mit Personen-Praefix (vor dieser Aufgabe gespeichert)", () => {
  // `currentStep` steht in der Datenbank und wird nur beim Speichern neu
  // geschrieben. Ein Bogen, der mitten in einem Personenschritt abgebrochen
  // wurde, traegt die alte Form ("p1.person_name") weiter – ohne Normalisierung
  // faende `schrittFinden` sie nie wieder, und Schrittseite/Einstiegsseite
  // leiten sich gegenseitig endlos an.
  const zuZweit: Antworten = { "anzahl_antragsteller.anzahl": "2" };

  it("findet den Schritt trotz altem Personen-Praefix wieder", () => {
    expect(schrittFinden("p1.person_name", zuZweit)?.id).toBe("person_name");
    expect(schrittFinden("p2.einkommen", zuZweit)?.id).toBe("einkommen");
  });

  it("findet weiterhin normal, wenn KEIN Praefix vorliegt", () => {
    expect(schrittFinden("kaufpreis", leer)?.id).toBe("kaufpreis");
    expect(schrittFinden("gibtesnicht", leer)).toBeNull();
  });

  it("zaehlt den Fortschritt trotz altem Praefix, statt 0 zu melden", () => {
    const f = fortschritt("p2.einkommen", zuZweit);
    expect(f.position).toBeGreaterThan(0);
    expect(f.position).toBe(sichtbareSchritte(zuZweit).findIndex((s) => s.id === "einkommen") + 1);
  });
});
