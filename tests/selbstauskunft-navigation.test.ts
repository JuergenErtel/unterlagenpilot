import { describe, it, expect } from "vitest";
import {
  sichtbareSchritte,
  schrittFinden,
  naechsterSchritt,
  vorherigerSchritt,
  fortschritt,
  schluessel,
  personenSchluessel,
  einstiegsSchritt,
} from "@/lib/self-disclosure/navigation";
import { sichtbareFelder } from "@/lib/self-disclosure/felder";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import type { Antworten } from "@/lib/self-disclosure/types";

const leer: Antworten = {};

/**
 * Seit dem Katalogschnitt buendelt EINE Seite mehrere Fragen. Was frueher als
 * Schritt erschien oder verschwand (Kaufpreis, Baukosten, Maklergebuehr), ist
 * jetzt ein Feld auf "Um welche Immobilie geht es?" – die Verzweigungen werden
 * deshalb ueber `sichtbareFelder` geprueft, nicht mehr ueber die Schrittkette.
 */
const preisFelder = (a: Antworten) =>
  sichtbareFelder(KATALOG.find((s) => s.id === "objekt_preis")!, a).map((f) => f.id);

/** Dasselbe fuer die Folgeseite – dort steht die Hoehe der Maklergebuehr. */
const wunschFelder = (a: Antworten) =>
  sichtbareFelder(KATALOG.find((s) => s.id === "finanzierungswunsch")!, a).map((f) => f.id);

describe("Katalog-Navigation", () => {
  it("beginnt mit dem Vorhaben", () => {
    expect(sichtbareSchritte(leer, "voll")[0]!.id).toBe("vorhaben");
  });

  it("zeigt den Kaufpreis nur im Kaufzweig", () => {
    const kauf = { "vorhaben.art": "kauf_bestand" };
    const modernisierung = { "vorhaben.art": "modernisierung" };
    expect(preisFelder(kauf)).toContain("kaufpreis");
    expect(preisFelder(modernisierung)).not.toContain("kaufpreis");
    expect(preisFelder(modernisierung)).toContain("modernisierung");
  });

  it("nimmt ohne Angabe zur Finanzierungsart den Kaufzweig", () => {
    // Ausnahme von der Regel "unbeantwortet -> Zweig zu": ohne den Kaufzweig
    // bliebe fast nichts übrig.
    expect(preisFelder(leer)).toContain("kaufpreis");
  });

  it("überspringt die Höhe der Maklergebühr, solange keine anfällt", () => {
    // Die Ja/Nein-Frage steht auf "objekt_preis", das Prozentfeld eine Seite
    // weiter – erst diese Seitengrenze macht es im Ablauf erreichbar.
    expect(wunschFelder({ "objekt_preis.makler": "nein" })).not.toContain("makler_hoehe");
    expect(wunschFelder({ "objekt_preis.makler": "ja" })).toContain("makler_hoehe");
  });

  it("hält den Zweig zu, wenn die Steuerfrage übersprungen wurde", () => {
    expect(wunschFelder(leer)).not.toContain("makler_hoehe");
  });

  it("liefert den nächsten und vorherigen Schritt entlang der sichtbaren Kette", () => {
    const a: Antworten = { "vorhaben.art": "kauf_bestand" };
    const nach = naechsterSchritt("vorhaben", a, "voll");
    expect(nach!.id).toBe("objekt_preis");
    expect(vorherigerSchritt(nach!.id, a, "voll")!.id).toBe("vorhaben");
  });

  it("gibt am Ende der Kette null zurück", () => {
    const a: Antworten = {};
    const letzter = sichtbareSchritte(a, "voll").at(-1)!;
    expect(naechsterSchritt(letzter.id, a, "voll")).toBeNull();
    expect(vorherigerSchritt(sichtbareSchritte(a, "voll")[0]!.id, a, "voll")).toBeNull();
  });

  it("zählt den Fortschritt über die tatsächlich sichtbaren Schritte", () => {
    const a: Antworten = { "vorhaben.art": "kauf_bestand" };
    const f = fortschritt("objekt_preis", a, "voll");
    expect(f.position).toBe(2);
    expect(f.gesamt).toBe(sichtbareSchritte(a, "voll").length);
  });

  it("baut Antwortschlüssel aus Schritt und Feld", () => {
    expect(schluessel("vorhaben", "art")).toBe("vorhaben.art");
  });
});

describe("Personen-Spalten", () => {
  it("erzeugt EINEN Schritt mit zwei Spalten statt zweier Schritte", () => {
    // Der Kern dieser Aufgabe: Ein Paar sitzt gemeinsam am Rechner und
    // erwartet beide nebeneinander, nicht erst ihn und dann sie.
    const kette = sichtbareSchritte({ "haushalt.anzahl": "2" }, "voll");
    const personenschritte = kette.filter((s) => s.schritt.personenSpalten);
    expect(personenschritte.length).toBeGreaterThan(0);
    for (const s of personenschritte) {
      expect(s.personen).toEqual([1, 2]);
      expect(s.id).not.toContain("p1.");
    }
  });

  it("zeigt bei einem Antragsteller nur eine Spalte", () => {
    const kette = sichtbareSchritte({}, "voll");
    for (const s of kette.filter((x) => x.schritt.personenSpalten)) {
      expect(s.personen).toEqual([1]);
    }
  });

  it("baut den Schluessel weiterhin mit Personen-Praefix", () => {
    // Die Schluesselform bleibt: Uebernahme, Vorbelegung und Pflichtangaben
    // lesen sie so. Nur der Praefix wandert aus der Schritt-ID in den Bau.
    expect(personenSchluessel("personen", "nachname", 1)).toBe("p1.personen.nachname");
    expect(personenSchluessel("personen", "nachname", 2)).toBe("p2.personen.nachname");
    expect(personenSchluessel("objekt_preis", "kaufpreis")).toBe("objekt_preis.kaufpreis");
  });

  it("zaehlt die Kette kuerzer, weil Personenschritte nicht mehr doppeln", () => {
    const einer = sichtbareSchritte({}, "voll").length;
    const zwei = sichtbareSchritte({ "haushalt.anzahl": "2" }, "voll").length;
    expect(zwei).toBe(einer);
  });

  it("gibt dem gemischten Paar nur die Berufsfrage, die zur jeweiligen Person passt", () => {
    // Fund der Prüfung: `personen` ist eine ECHTE Teilmenge, berechnet über
    // `schritt.sichtbar(antworten, person)` je Person. Seit dem Katalogschnitt
    // stehen beide Berufszweige auf EINER Seite – die Trennung wandert damit
    // von der Schrittkette in die Feldliste der jeweiligen Spalte. Sonst würde
    // die Selbstständige (Person 2) nach Arbeitgeber gefragt (falsche Felder)
    // und ihre Firmendaten nie erhoben.
    const antworten: Antworten = {
      "haushalt.anzahl": "2",
      "p1.personen.beruf_art": "angestellter",
      "p2.personen.beruf_art": "selbststaendiger",
    };
    const beruf = sichtbareSchritte(antworten, "voll").find((s) => s.id === "beruf_details")!;
    expect(beruf.personen).toEqual([1, 2]);

    const felder = (person: 1 | 2) =>
      sichtbareFelder(beruf.schritt, antworten, person).map((f) => f.id);
    expect(felder(1)).toContain("arbeitgeber");
    expect(felder(1)).not.toContain("firma");
    expect(felder(2)).toContain("firma");
    expect(felder(2)).not.toContain("arbeitgeber");
  });

  it("laesst die Berufsseite ganz weg, wenn niemand einen der Zweige traegt", () => {
    // Ein Rentnerpaar bekaeme sonst eine Seite mit zwei leeren Spalten und
    // einem "Weiter" – die Bedingung steht deshalb ZUSAETZLICH am Schritt.
    const ids = sichtbareSchritte({ "p1.personen.beruf_art": "rentner" }, "voll").map((s) => s.id);
    expect(ids).not.toContain("beruf_details");
  });
});

describe("Alte currentStep-Werte mit Personen-Praefix (vor dieser Aufgabe gespeichert)", () => {
  // `currentStep` steht in der Datenbank und wird nur beim Speichern neu
  // geschrieben. Ein Bogen, der mitten in einem Personenschritt abgebrochen
  // wurde, traegt die alte Form ("p1.personen") weiter – ohne Normalisierung
  // faende `schrittFinden` sie nie wieder, und Schrittseite/Einstiegsseite
  // leiten sich gegenseitig endlos an.
  const zuZweit: Antworten = { "haushalt.anzahl": "2" };

  it("findet den Schritt trotz altem Personen-Praefix wieder", () => {
    expect(schrittFinden("p1.personen", zuZweit, "voll")?.id).toBe("personen");
    expect(schrittFinden("p2.einnahmen", zuZweit, "voll")?.id).toBe("einnahmen");
  });

  it("findet weiterhin normal, wenn KEIN Praefix vorliegt", () => {
    expect(schrittFinden("objekt_preis", leer, "voll")?.id).toBe("objekt_preis");
    expect(schrittFinden("gibtesnicht", leer, "voll")).toBeNull();
  });

  it("zaehlt den Fortschritt trotz altem Praefix, statt 0 zu melden", () => {
    const f = fortschritt("p2.einnahmen", zuZweit, "voll");
    expect(f.position).toBeGreaterThan(0);
    expect(f.position).toBe(
      sichtbareSchritte(zuZweit, "voll").findIndex((s) => s.id === "einnahmen") + 1
    );
  });
});

/**
 * Wohin der Einstieg (`/selbstauskunft/<token>`) weiterleitet.
 *
 * Der Fund: Die Einstiegsseite schickte UNGEPRUEFT auf `bogen.currentStep`,
 * und die Schrittseite schickt bei Unbekanntem zurueck auf den Einstieg. Von
 * den vierunddreissig alten Schritt-IDs ueberleben nach dem Katalogschnitt
 * genau zwei; `findeInKette` faengt nur die Form "p1.<id>" ab. Ein Bogen mit
 * `currentStep: "kaufpreis"` lief damit in ERR_TOO_MANY_REDIRECTS – ohne jede
 * Selbstheilung, denn `currentStep` wird nur beim Speichern neu geschrieben,
 * und dazu kam der Kunde ja nie.
 */
describe("Einstieg", () => {
  const leereAntworten: Antworten = {};

  it("faellt bei einem currentStep, den es nicht mehr gibt, auf die erste Seite", () => {
    expect(einstiegsSchritt("kaufpreis", leereAntworten, "voll")).toBe("vorhaben");
  });

  it("faellt auch ohne gemerkten Schritt auf die erste Seite", () => {
    expect(einstiegsSchritt(null, leereAntworten, "voll")).toBe("vorhaben");
  });

  it("nimmt einen Schritt, den es noch gibt", () => {
    expect(einstiegsSchritt("finanzierungswunsch", leereAntworten, "voll")).toBe(
      "finanzierungswunsch"
    );
  });

  it("normalisiert den alten Personen-Praefix statt ihn weiterzureichen", () => {
    expect(einstiegsSchritt("p1.personen", leereAntworten, "voll")).toBe("personen");
  });

  it("faellt auf die erste Seite, wenn der gemerkte Schritt im kurzen Weg fehlt", () => {
    // Ein Bogen kann vom persoenlichen Link auf einen Formular-Link wechseln;
    // "konditionen" gibt es dort nicht.
    expect(einstiegsSchritt("konditionen", leereAntworten, "kurz")).toBe("vorhaben");
  });

  it("laesst die Zusammenfassung stehen", () => {
    // Sie ist keine Katalogseite, aber ein gueltiges Ziel: Wer die letzte Seite
    // abgeschickt, aber nicht abgesendet hat, steht genau dort.
    expect(einstiegsSchritt("zusammenfassung", leereAntworten, "voll")).toBe("zusammenfassung");
  });
});
