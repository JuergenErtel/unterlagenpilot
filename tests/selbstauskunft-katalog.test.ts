import { describe, it, expect } from "vitest";
import { sichtbareSchritte, offeneFelder } from "@/lib/self-disclosure/navigation";
import { schrittSchema } from "@/lib/self-disclosure/schema";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import type { Antworten } from "@/lib/self-disclosure/types";

const ids = (a: Antworten) => sichtbareSchritte(a).map((s) => s.id);

describe("Katalog: Personen- und Berufsabschnitt", () => {
  it("fragt Person und Beruf bei zwei Antragstellern zweimal", () => {
    const zuZweit = ids({ "anzahl_antragsteller.anzahl": "2" });
    expect(zuZweit).toContain("p1.person_name");
    expect(zuZweit).toContain("p2.person_name");
    expect(zuZweit).toContain("p2.einkommen");
  });

  it("fragt ohne Angabe zur Personenzahl nur die erste Person", () => {
    expect(ids({})).toContain("p1.person_name");
    expect(ids({})).not.toContain("p2.person_name");
  });

  it("zeigt Arbeitgeberfragen nur bei abhängiger Beschäftigung", () => {
    const angestellt = ids({ "p1.beruf_art.art": "angestellter" });
    expect(angestellt).toContain("p1.beruf_arbeitgeber");
    expect(angestellt).not.toContain("p1.beruf_selbststaendig");
  });

  it("zeigt die Firmenfragen bei Selbstständigen", () => {
    const selbst = ids({ "p1.beruf_art.art": "selbststaendiger" });
    expect(selbst).toContain("p1.beruf_selbststaendig");
    expect(selbst).not.toContain("p1.beruf_arbeitgeber");
  });

  it("hält beide Berufszweige zu, solange die Art offen ist", () => {
    expect(ids({})).not.toContain("p1.beruf_arbeitgeber");
    expect(ids({})).not.toContain("p1.beruf_selbststaendig");
  });

  it("wertet den Berufszweig je Person getrennt aus", () => {
    const gemischt = ids({
      "anzahl_antragsteller.anzahl": "2",
      "p1.beruf_art.art": "angestellter",
      "p2.beruf_art.art": "selbststaendiger",
    });
    expect(gemischt).toContain("p1.beruf_arbeitgeber");
    expect(gemischt).not.toContain("p2.beruf_arbeitgeber");
    expect(gemischt).toContain("p2.beruf_selbststaendig");
    expect(gemischt).not.toContain("p1.beruf_selbststaendig");
  });

  it("fragt Kinder genau einmal, nie je Person", () => {
    const zuZweit = ids({ "anzahl_antragsteller.anzahl": "2" });
    expect(zuZweit.filter((i) => i.endsWith("haushalt_kinder"))).toHaveLength(1);
  });

  it("zeigt die Objektdetails nur bei gefundener Immobilie", () => {
    expect(ids({ "objektstand.stand": "gefunden" })).toContain("objekt_masse");
    expect(ids({ "objektstand.stand": "nicht_besichtigt" })).not.toContain("objekt_masse");
    expect(ids({})).not.toContain("objekt_masse");
  });
});

describe("Feldvalidierung", () => {
  const betragsSchritt = KATALOG.find((s) => s.id === "kaufpreis")!;

  it("nimmt einen leeren Schritt an – es gibt keine Pflichtfelder", () => {
    expect(schrittSchema(betragsSchritt).safeParse({ betrag: "" }).success).toBe(true);
    expect(schrittSchema(betragsSchritt).safeParse({}).success).toBe(true);
  });

  it("weist einen unlesbaren Betrag zurück", () => {
    expect(schrittSchema(betragsSchritt).safeParse({ betrag: "dreitausend" }).success).toBe(false);
  });

  it("nimmt Beträge mit deutschem Tausenderpunkt an", () => {
    const r = schrittSchema(betragsSchritt).safeParse({ betrag: "400.000" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.betrag).toBe(400000);
  });

  it("weist eine Auswahl außerhalb der Optionen zurück", () => {
    const auswahl = KATALOG.find((s) => s.id === "finanzierungsart")!;
    expect(schrittSchema(auswahl).safeParse({ art: "kauf_bestand" }).success).toBe(true);
    expect(schrittSchema(auswahl).safeParse({ art: "raumschiff" }).success).toBe(false);
  });

  it("liest ja/nein als Wahrheitswert", () => {
    const dauer = KATALOG.find((s) => s.id === "beruf_dauer")!;
    const r = schrittSchema(dauer).safeParse({ probezeit: "ja" });
    expect(r.success && r.data.probezeit).toBe(true);
  });
});

describe("offene Felder", () => {
  it("meldet jedes sichtbare, unbeantwortete Feld", () => {
    const offen = offeneFelder({ "finanzierungsart.art": "kauf_bestand" });
    expect(offen.some((o) => o.schrittId === "kaufpreis" && o.feldId === "betrag")).toBe(true);
    expect(offen.some((o) => o.schrittId === "finanzierungsart")).toBe(false);
  });

  it("meldet nichts aus unsichtbaren Zweigen", () => {
    const offen = offeneFelder({ "finanzierungsart.art": "modernisierung" });
    expect(offen.some((o) => o.schrittId === "kaufpreis")).toBe(false);
  });
});
