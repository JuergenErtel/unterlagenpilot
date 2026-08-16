import { describe, expect, it } from "vitest";
import { KATALOG } from "@/lib/self-disclosure/catalog";

/**
 * Der kurze Bogen existiert, um der Machbarkeits-Ampel zu genuegen. Nimmt ihm
 * jemand ein Feld weg, das der Solver rechnet, bleibt die Ampel still grau –
 * und niemand weiss warum. Dieser Test ist die Bremse davor.
 *
 * Was diese Liste bewacht: nicht nur, was die AMPELFARBE (`machbar`) bestimmt,
 * sondern was der Kunde liefern muss, damit die Machbarkeitsrechnung
 * VOLLSTAENDIG ist – inklusive der Angaben, die nur berichtet, aber nicht in
 * die Farbe eingerechnet werden (siehe wunschrateMonatlich unten). Beide
 * gehoeren in den kurzen Bogen: Faellt eines still heraus, fehlt entweder die
 * Farbe oder das, was Juergen dem Kunden am Telefon zurueckspiegelt.
 *
 * Die Liste ist gegen `SolverEingabe` (src/lib/machbarkeit/types.ts) und ihren
 * Aufbau in `baueEingabe` (src/lib/machbarkeit/eingabe.ts) geprueft, nicht nur
 * abgeschrieben. Eine Korrektur gegenueber dem urspruenglichen Aufgabenzuschnitt:
 * "financingRequest.darlehenswunsch" fehlt hier bewusst. `SolverEingabe` kennt
 * gar kein Feld dieses Namens, und `baueEingabe` liest `c.financing?.darlehenswunsch`
 * an keiner Stelle – der Solver ERRECHNET die moegliche Darlehenssumme selbst
 * (Kaufpreis + Nebenkosten − Eigenkapital, siehe bewertung.ts), er nimmt den
 * Darlehenswunsch nicht als Eingabe entgegen. Ein Vertrag, der ihn trotzdem
 * verlangt, wuerde eine Menge bewachen, die es im Solver gar nicht gibt.
 *
 * Gegenprobe (macht diesen Test rot): in catalog.ts bei
 * "finanzierungswunsch.wunschrate" das `ziel` entfernen – dann faellt
 * "fragt financingRequest.wunschrateMonatlich" rot, weil kein Feld des kurzen
 * Bogens mehr dorthin zielt. Belegt in task-6-report.md.
 */
const AMPEL_BRAUCHT = [
  "financingRequest.kaufpreis",
  "financingRequest.eigenkapital",
  // Faerbt die Ampel selbst NICHT (bewertung.ts: "Die Wunschrate faerbt die
  // Ampel NICHT ... machbar bleibt die Bankensicht", Entscheidung vom
  // 13.08.2026). Bleibt trotzdem Pflicht fuer diese Liste: Der Solver liest
  // sie (wunschrateAbweichung) und der kurze Bogen ist der einzige Ort, an dem
  // der Kunde sie nennt – ohne sie kann Juergen am Telefon nicht sagen "Sie
  // wollten X Euro, moeglich sind Y Euro".
  "financingRequest.wunschrateMonatlich",
  "financingRequest.maklerprovisionProzent",
  "property.zip",
  "property.wohnflaeche",
  "income.nettoMonatlich",
  "applicant.anzahlKinder",
];

function zieleDesKurzenBogens(): Set<string> {
  const out = new Set<string>();
  for (const s of KATALOG.filter((x) => x.umfang === "kurz")) {
    for (const f of s.felder) {
      if (f.ziel && "feld" in f.ziel) out.add(`${f.ziel.entitaet}.${f.ziel.feld}`);
    }
  }
  return out;
}

describe("Kurzer Bogen deckt die Machbarkeits-Ampel", () => {
  const ziele = zieleDesKurzenBogens();
  for (const gebraucht of AMPEL_BRAUCHT) {
    it(`fragt ${gebraucht}`, () => {
      expect(ziele.has(gebraucht)).toBe(true);
    });
  }

  it("fragt die Anzahl der Antragsteller", () => {
    const haushalt = KATALOG.find((s) => s.id === "haushalt");
    expect(haushalt?.felder.map((f) => f.id)).toContain("anzahl");
  });

  it("fragt die laufenden Verpflichtungen", () => {
    const seite = KATALOG.find((s) => s.id === "verpflichtungen");
    expect(seite?.umfang).toBe("kurz");
    expect(seite?.felder[0]?.ziel).toBeTruthy();
  });
});
