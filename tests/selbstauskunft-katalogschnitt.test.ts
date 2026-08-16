import { describe, expect, it } from "vitest";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import { sichtbareSchritte, fortschritt } from "@/lib/self-disclosure/navigation";
import { planUebernahme } from "@/lib/self-disclosure/takeover";

const KURZ = ["vorhaben", "objekt_preis", "finanzierungswunsch", "haushalt", "personen", "verpflichtungen"];
const VOLL_ZUSAETZLICH = [
  "person_details",
  "beruf_details",
  "einnahmen",
  "haushalt_ausgaben",
  "eigenkapital_herkunft",
  "objekt_details",
  "konditionen",
];

describe("Katalogschnitt", () => {
  it("hat genau dreizehn Seiten", () => {
    expect(KATALOG.map((s) => s.id)).toEqual([...KURZ, ...VOLL_ZUSAETZLICH]);
  });

  it("die kurze Kette enthaelt keine volle Seite", () => {
    const kette = sichtbareSchritte({ "vorhaben.art": "kauf_bestand" }, "kurz");
    for (const s of kette) expect(s.schritt.umfang).toBe("kurz");
  });

  it("die volle Kette beginnt mit denselben Seiten wie die kurze", () => {
    const antworten = { "vorhaben.art": "kauf_bestand" };
    const kurz = sichtbareSchritte(antworten, "kurz").map((s) => s.id);
    const voll = sichtbareSchritte(antworten, "voll").map((s) => s.id);
    expect(voll.slice(0, kurz.length)).toEqual(kurz);
  });

  it("jede Seite traegt einen Umfang und eine nicht leere Feldliste", () => {
    for (const s of KATALOG) {
      expect(["kurz", "voll"]).toContain(s.umfang);
      expect(s.felder.length).toBeGreaterThan(0);
    }
  });

  it("Feld-IDs sind je Seite eindeutig", () => {
    // Zwei gleich benannte Felder auf einer Seite ergaeben denselben
    // Antwortschluessel – die zweite Antwort ueberschriebe die erste.
    for (const s of KATALOG) {
      const ids = s.felder.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("die Personenseiten tragen Spalten", () => {
    for (const id of ["personen", "person_details", "beruf_details", "einnahmen"]) {
      expect(KATALOG.find((s) => s.id === id)?.personenSpalten).toBe(true);
    }
  });

  it("der Fortschritt zaehlt 'von 6' im kurzen Weg", () => {
    // Die angezeigte Gesamtzahl ist der Grund, weiterzumachen oder
    // abzubrechen – sie ist die eigentliche Zusicherung dieser Arbeit.
    const antworten = { "vorhaben.art": "kauf_bestand" };
    expect(fortschritt("vorhaben", antworten, "kurz").gesamt).toBe(6);
  });

  it("die Uebernahme liest einen kurz ausgefuellten Bogen vollstaendig", () => {
    // Auch die zweite Spalte: Wer zu zweit anfragt, darf seinen Partner nicht
    // beim Uebernehmen verlieren.
    const antworten = {
      "vorhaben.art": "kauf_bestand",
      "haushalt.anzahl": "2",
      "p1.personen.nachname": "Eins",
      "p2.personen.nachname": "Zwei",
    };
    const plan = planUebernahme(antworten, {
      applicants: [
        { id: "a1", position: 1 },
        { id: "a2", position: 2 },
      ],
      property: null,
      financingRequest: null,
      caseFelder: { financingType: null },
    });
    const nachnamen = plan.vorschlaege.filter((v) => v.ziel.feld === "nachname");
    expect(nachnamen.map((v) => v.kundenwert).sort()).toEqual(["Eins", "Zwei"]);
  });
});
