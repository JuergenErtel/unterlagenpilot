import { describe, expect, it } from "vitest";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import { sichtbareSchritte } from "@/lib/self-disclosure/navigation";

describe("Katalog-Vertrag", () => {
  it("kein Zielfeld wird von zwei gleichzeitig sichtbaren Feldern beschrieben", () => {
    // Kaufpreis, Restschuld, Kapitalbedarf und Darlehenswunsch zeigen alle auf
    // financingRequest.darlehenswunsch bzw. .kaufpreis. Ihre Bedingungen
    // muessen sich ausschliessen – sonst schreiben zwei Antworten in dasselbe
    // Feld, und welche gewinnt, entscheidet die Reihenfolge im Katalog.
    for (const art of ["kauf_bestand", "neubau", "modernisierung", "anschlussfinanzierung", "kapitalbeschaffung"]) {
      const antworten = { "vorhaben.art": art };
      const gesehen = new Map<string, string>();
      for (const s of sichtbareSchritte(antworten, "voll")) {
        for (const f of s.schritt.felder) {
          if (f.sichtbar && !f.sichtbar(antworten)) continue;
          if (!f.ziel || !("feld" in f.ziel)) continue;
          const ziel = `${f.ziel.entitaet}.${f.ziel.feld}`;
          const schon = gesehen.get(ziel);
          expect(schon, `${ziel}: ${schon} und ${s.id}.${f.id} bei ${art}`).toBeUndefined();
          gesehen.set(ziel, `${s.id}.${f.id}`);
        }
      }
    }
  });

  it("jede Auswahl hat Optionen, jedes Listenfeld ein Listenziel", () => {
    for (const s of KATALOG) {
      for (const f of s.felder) {
        if (f.typ === "auswahl") expect(f.optionen?.length ?? 0).toBeGreaterThan(0);
        if (f.ziel && "liste" in f.ziel) expect(f.typ).toBe("text");
      }
    }
  });
});
