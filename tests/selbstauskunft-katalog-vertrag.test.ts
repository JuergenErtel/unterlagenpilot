import { describe, expect, it } from "vitest";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import { sichtbareSchritte } from "@/lib/self-disclosure/navigation";

/**
 * Alle Werte von "vorhaben.art" – aus dem Katalog SELBST gelesen, nicht
 * abgeschrieben. Eine abgeschriebene Liste liefe beim naechsten neuen Wert
 * (oder einer Umbenennung) still auseinander: `tsc` sieht das nicht, weil
 * `Antworten` beliebige Strings zulaesst – ein Tippfehler wie "neubau" statt
 * "kauf_neubau" waere kein Typfehler, sondern nur ein Zweig, der nie einen
 * einzigen Test erreicht. Fehlte hier z. B. "eigenes_bauvorhaben", wuerde der
 * einzige Zweig mit den Feldern `grundstueck`/`bau` nie geprueft.
 */
function vorhabenArten(): string[] {
  const feld = KATALOG.find((s) => s.id === "vorhaben")?.felder.find((f) => f.id === "art");
  const arten = feld?.optionen?.map((o) => o.wert) ?? [];
  if (arten.length === 0) throw new Error("vorhaben.art hat keine Optionen mehr – Katalog umgebaut?");
  return arten;
}

describe("Katalog-Vertrag", () => {
  it("kein Zielfeld wird von zwei gleichzeitig sichtbaren Feldern beschrieben", () => {
    // Kaufpreis, Restschuld, Kapitalbedarf und Darlehenswunsch zeigen alle auf
    // financingRequest.darlehenswunsch bzw. .kaufpreis. Ihre Bedingungen
    // muessen sich ausschliessen – sonst schreiben zwei Antworten in dasselbe
    // Feld, und welche gewinnt, entscheidet die Reihenfolge im Katalog.
    //
    // Gegenprobe (macht diesen Test rot): in catalog.ts bei
    // "objekt_preis.restschuld" `sichtbar: istAnschlussfinanzierung` durch
    // `sichtbar: () => true` ersetzen – dann kollidiert das Feld bei
    // "kauf_bestand" mit "finanzierungswunsch.darlehen" (beide zielen auf
    // financingRequest.darlehenswunsch). Belegt in task-6-report.md.
    for (const art of vorhabenArten()) {
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
