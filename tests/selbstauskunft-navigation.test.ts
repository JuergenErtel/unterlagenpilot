import { describe, it, expect } from "vitest";
import {
  sichtbareSchritte,
  naechsterSchritt,
  vorherigerSchritt,
  fortschritt,
  schluessel,
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
