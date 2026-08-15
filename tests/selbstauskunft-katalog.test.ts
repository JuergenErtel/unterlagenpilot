import { describe, it, expect } from "vitest";
import { sichtbareSchritte, offeneFelder, personenSchluessel } from "@/lib/self-disclosure/navigation";
import { schrittSchema } from "@/lib/self-disclosure/schema";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import type { Antworten } from "@/lib/self-disclosure/types";

const ids = (a: Antworten) => sichtbareSchritte(a, "voll").map((s) => s.id);

describe("Katalog: Personen- und Berufsabschnitt", () => {
  it("fragt Person und Beruf bei zwei Antragstellern als EINEN Schritt mit beiden Spalten", () => {
    const zuZweit = sichtbareSchritte({ "anzahl_antragsteller.anzahl": "2" }, "voll");
    expect(zuZweit.find((s) => s.id === "person_name")!.personen).toEqual([1, 2]);
    expect(zuZweit.find((s) => s.id === "einkommen")!.personen).toEqual([1, 2]);
  });

  it("zeigt ohne Angabe zur Personenzahl nur eine Spalte", () => {
    const einer = sichtbareSchritte({}, "voll");
    expect(einer.find((s) => s.id === "person_name")!.personen).toEqual([1]);
  });

  it("zeigt Arbeitgeberfragen nur bei abhängiger Beschäftigung", () => {
    const angestellt = ids({ "p1.beruf_art.art": "angestellter" });
    expect(angestellt).toContain("beruf_arbeitgeber");
    expect(angestellt).not.toContain("beruf_selbststaendig");
  });

  it("zeigt die Firmenfragen bei Selbstständigen", () => {
    const selbst = ids({ "p1.beruf_art.art": "selbststaendiger" });
    expect(selbst).toContain("beruf_selbststaendig");
    expect(selbst).not.toContain("beruf_arbeitgeber");
  });

  it("hält beide Berufszweige zu, solange die Art offen ist", () => {
    expect(ids({})).not.toContain("beruf_arbeitgeber");
    expect(ids({})).not.toContain("beruf_selbststaendig");
  });

  it("wertet den Berufszweig je Person getrennt aus – auch bei einem gemischten Paar", () => {
    // `personen` ist eine echte Teilmenge (siehe sichtbareSchritte): die
    // Selbststaendige bekommt ihre Firmenfragen, der Angestellte seine
    // Arbeitgeberfragen – nicht beide dieselbe Frage fuer beide Spalten.
    // Genauere Pruefung der Personen-Teilmengen in
    // selbstauskunft-navigation.test.ts.
    const gemischt = ids({
      "anzahl_antragsteller.anzahl": "2",
      "p1.beruf_art.art": "angestellter",
      "p2.beruf_art.art": "selbststaendiger",
    });
    expect(gemischt).toContain("beruf_arbeitgeber");
    expect(gemischt).toContain("beruf_selbststaendig");
  });

  it("fragt Kinder genau einmal, nie je Person", () => {
    const zuZweit = ids({ "anzahl_antragsteller.anzahl": "2" });
    expect(zuZweit.filter((i) => i === "haushalt_kinder")).toHaveLength(1);
  });

  it("zeigt die Objektdetails nur bei gefundener Immobilie", () => {
    expect(ids({ "objektstand.stand": "gefunden" })).toContain("objekt_masse");
    expect(ids({ "objektstand.stand": "nicht_besichtigt" })).not.toContain("objekt_masse");
    expect(ids({})).not.toContain("objekt_masse");
  });
});

describe("Feldvalidierung", () => {
  const betragsSchritt = KATALOG.find((s) => s.id === "kaufpreis")!;
  const betragsSchluessel = personenSchluessel(betragsSchritt.id, "betrag");

  it("nimmt einen leeren Schritt an – es gibt keine Pflichtfelder", () => {
    expect(schrittSchema(betragsSchritt).safeParse({ [betragsSchluessel]: "" }).success).toBe(true);
    expect(schrittSchema(betragsSchritt).safeParse({}).success).toBe(true);
  });

  it("weist einen unlesbaren Betrag zurück", () => {
    expect(
      schrittSchema(betragsSchritt).safeParse({ [betragsSchluessel]: "dreitausend" }).success
    ).toBe(false);
  });

  it("nimmt Beträge mit deutschem Tausenderpunkt an", () => {
    const r = schrittSchema(betragsSchritt).safeParse({ [betragsSchluessel]: "400.000" });
    expect(r.success).toBe(true);
    expect(r.success && r.data[betragsSchluessel]).toBe(400000);
  });

  it("weist eine Auswahl außerhalb der Optionen zurück", () => {
    const auswahl = KATALOG.find((s) => s.id === "finanzierungsart")!;
    const k = personenSchluessel(auswahl.id, "art");
    expect(schrittSchema(auswahl).safeParse({ [k]: "kauf_bestand" }).success).toBe(true);
    expect(schrittSchema(auswahl).safeParse({ [k]: "raumschiff" }).success).toBe(false);
  });

  it("liest ja/nein als Wahrheitswert", () => {
    const dauer = KATALOG.find((s) => s.id === "beruf_dauer")!;
    const k = personenSchluessel(dauer.id, "probezeit");
    const r = schrittSchema(dauer).safeParse({ [k]: "ja" });
    expect(r.success && r.data[k]).toBe(true);
  });

  it("behaelt die Antworten beider Spalten", () => {
    // Der Kern der Falle: schrittSchema muss dieselben Schluessel bilden wie
    // das Formular – sonst wirft .strip() beide Antworten lautlos weg.
    const schritt = KATALOG.find((s) => s.personenSpalten)!;
    // Ein Textfeld, damit "eins"/"zwei" die Formvalidierung besteht – das
    // erste Feld des Schritts ist eine Auswahl (Anrede) und keine.
    const feld = schritt.felder.find((f) => f.typ === "text")!.id;
    const geprueft = schrittSchema(schritt, [1, 2]).parse({
      [`p1.${schritt.id}.${feld}`]: "eins",
      [`p2.${schritt.id}.${feld}`]: "zwei",
    });
    // Ohne die Schluesselform oben waere das Ergebnis hier leer – lautlos.
    expect(Object.keys(geprueft)).toHaveLength(2);
  });
});

describe("offene Felder", () => {
  it("meldet jedes sichtbare, unbeantwortete Feld", () => {
    const offen = offeneFelder({ "finanzierungsart.art": "kauf_bestand" }, "voll");
    expect(offen.some((o) => o.schrittId === "kaufpreis" && o.feldId === "betrag")).toBe(true);
    expect(offen.some((o) => o.schrittId === "finanzierungsart")).toBe(false);
  });

  it("meldet nichts aus unsichtbaren Zweigen", () => {
    const offen = offeneFelder({ "finanzierungsart.art": "modernisierung" }, "voll");
    expect(offen.some((o) => o.schrittId === "kaufpreis")).toBe(false);
  });
});
