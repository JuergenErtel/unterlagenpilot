import { describe, it, expect } from "vitest";
import { sichtbareSchritte, offeneFelder, personenSchluessel } from "@/lib/self-disclosure/navigation";
import { sichtbareFelder } from "@/lib/self-disclosure/felder";
import { schrittSchema } from "@/lib/self-disclosure/schema";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import type { Antworten } from "@/lib/self-disclosure/types";

const ids = (a: Antworten) => sichtbareSchritte(a, "voll").map((s) => s.id);

const seite = (id: string) => KATALOG.find((s) => s.id === id)!;

/** Die Felder einer Seite, die diese Person tatsaechlich sieht. */
const felderVon = (id: string, a: Antworten, person?: 1 | 2) =>
  sichtbareFelder(seite(id), a, person).map((f) => f.id);

describe("Katalog: Personen- und Berufsabschnitt", () => {
  it("fragt Person und Beruf bei zwei Antragstellern als EINEN Schritt mit beiden Spalten", () => {
    const zuZweit = sichtbareSchritte({ "haushalt.anzahl": "2" }, "voll");
    expect(zuZweit.find((s) => s.id === "personen")!.personen).toEqual([1, 2]);
    expect(zuZweit.find((s) => s.id === "einnahmen")!.personen).toEqual([1, 2]);
  });

  it("zeigt ohne Angabe zur Personenzahl nur eine Spalte", () => {
    const einer = sichtbareSchritte({}, "voll");
    expect(einer.find((s) => s.id === "personen")!.personen).toEqual([1]);
  });

  it("zeigt Arbeitgeberfragen nur bei abhängiger Beschäftigung", () => {
    const a = { "p1.personen.beruf_art": "angestellter" };
    expect(ids(a)).toContain("beruf_details");
    expect(felderVon("beruf_details", a, 1)).toContain("arbeitgeber");
    expect(felderVon("beruf_details", a, 1)).not.toContain("firma");
  });

  it("zeigt die Firmenfragen bei Selbstständigen", () => {
    const a = { "p1.personen.beruf_art": "selbststaendiger" };
    expect(ids(a)).toContain("beruf_details");
    expect(felderVon("beruf_details", a, 1)).toContain("firma");
    expect(felderVon("beruf_details", a, 1)).not.toContain("arbeitgeber");
  });

  it("hält beide Berufszweige zu, solange die Art offen ist", () => {
    // Und weil dann kein einziges Feld bliebe, entfaellt die ganze Seite –
    // ein leerer Bildschirm mit "Weiter" waere schlimmer als eine Frage zu
    // wenig.
    expect(felderVon("beruf_details", {}, 1)).toEqual([]);
    expect(ids({})).not.toContain("beruf_details");
  });

  it("wertet den Berufszweig je Person getrennt aus – auch bei einem gemischten Paar", () => {
    // `personen` ist eine echte Teilmenge (siehe sichtbareSchritte), und
    // innerhalb der Spalte entscheidet `Feld.sichtbar`: die Selbststaendige
    // bekommt ihre Firmenfragen, der Angestellte seine Arbeitgeberfragen –
    // nicht beide dieselbe Frage fuer beide Spalten. Genauere Pruefung der
    // Personen-Teilmengen in selbstauskunft-navigation.test.ts.
    const gemischt: Antworten = {
      "haushalt.anzahl": "2",
      "p1.personen.beruf_art": "angestellter",
      "p2.personen.beruf_art": "selbststaendiger",
    };
    expect(felderVon("beruf_details", gemischt, 1)).toContain("arbeitgeber");
    expect(felderVon("beruf_details", gemischt, 2)).toContain("firma");
  });

  it("fragt Kinder genau einmal, nie je Person", () => {
    const zuZweit = ids({ "haushalt.anzahl": "2" });
    expect(zuZweit.filter((i) => i === "haushalt")).toHaveLength(1);
    expect(seite("haushalt").personenSpalten).toBeUndefined();
  });

  it("zeigt die Objektdetails nur bei gefundener Immobilie", () => {
    expect(ids({ "vorhaben.stand": "gefunden" })).toContain("objekt_details");
    expect(ids({ "vorhaben.stand": "nicht_besichtigt" })).not.toContain("objekt_details");
    expect(ids({})).not.toContain("objekt_details");
  });

  it("fragt die Wohnfläche nur bei gefundener Immobilie", () => {
    // Sie steht seit dem Katalogschnitt auf der Preisseite, die es immer gibt
    // – die Bedingung musste also mit ans Feld wandern.
    expect(felderVon("objekt_preis", { "vorhaben.stand": "gefunden" })).toContain("wohnflaeche");
    expect(felderVon("objekt_preis", {})).not.toContain("wohnflaeche");
  });
});

describe("Feldvalidierung", () => {
  const betragsSchritt = seite("objekt_preis");
  const betragsSchluessel = personenSchluessel(betragsSchritt.id, "kaufpreis");

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
    const auswahl = seite("vorhaben");
    const k = personenSchluessel(auswahl.id, "art");
    expect(schrittSchema(auswahl).safeParse({ [k]: "kauf_bestand" }).success).toBe(true);
    expect(schrittSchema(auswahl).safeParse({ [k]: "raumschiff" }).success).toBe(false);
  });

  it("liest ja/nein als Wahrheitswert", () => {
    const beruf = seite("beruf_details");
    const k = personenSchluessel(beruf.id, "probezeit");
    const r = schrittSchema(beruf).safeParse({ [k]: "ja" });
    expect(r.success && r.data[k]).toBe(true);
  });

  it("behaelt die Antworten beider Spalten", () => {
    // Der Kern der Falle: schrittSchema muss dieselben Schluessel bilden wie
    // das Formular – sonst wirft .strip() beide Antworten lautlos weg.
    const schritt = KATALOG.find((s) => s.personenSpalten)!;
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
    const offen = offeneFelder({ "vorhaben.art": "kauf_bestand" }, "voll");
    expect(offen.some((o) => o.schrittId === "objekt_preis" && o.feldId === "kaufpreis")).toBe(true);
    expect(offen.some((o) => o.schrittId === "vorhaben" && o.feldId === "art")).toBe(false);
  });

  it("meldet nichts aus unsichtbaren Zweigen", () => {
    const offen = offeneFelder({ "vorhaben.art": "modernisierung" }, "voll");
    expect(offen.some((o) => o.feldId === "kaufpreis")).toBe(false);
    expect(offen.some((o) => o.feldId === "modernisierung")).toBe(true);
  });
});
