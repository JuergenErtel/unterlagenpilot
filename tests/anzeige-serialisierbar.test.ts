import { describe, expect, it } from "vitest";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import { fuerAnzeige } from "@/lib/self-disclosure/anzeige";

/**
 * Was über die Server/Client-Grenze geht, muss REINE DATEN sein.
 *
 * Dieser Test steht hier, weil an genau dieser Stelle eine Produktion
 * zerbrochen ist: Seit dem Katalogschnitt trägt `Feld` Funktionen (`sichtbar`).
 * Die Schrittseite der Selbstauskunft und die öffentliche Einstiegsseite
 * reichten `Feld`-Objekte unverändert als Requisiten an Client-Komponenten
 * weiter. React kann Funktionen nicht serialisieren und wirft;
 * `https://baufidesk.de/anfrage/ertel` antwortete mit HTTP 500, und die
 * gesamte Kundenstrecke war ebenso tot. Vor dem Schnitt war `Feld` reine
 * Datenbeschreibung — deshalb ging es jahrelang gut, und deshalb fiel beim
 * Schnitt niemandem auf, dass sich die Bauart der Requisite geändert hatte.
 *
 * Warum nichts es fing — drei blinde Flecken auf einmal:
 *  - `tsc` kennt die Serialisierungsgrenze nicht. `Feld[]` an eine
 *    Client-Komponente zu geben ist typkorrekt.
 *  - Vitest rendert keine RSC-Grenze; im Test ist es einfach ein Objekt.
 *  - `tests/rsc-grenze.test.ts` bewacht IMPORTE über die Grenze, nicht
 *    REQUISITEN. Das ist eine andere Fehlerklasse — der Wächter ist nicht
 *    schuld, er deckt sie nur nicht ab. Dieser hier deckt sie ab.
 *
 * Die Zusage: Was `fuerAnzeige` liefert, enthält nirgends — auch nicht tief
 * verschachtelt — einen Funktionswert.
 */

/** Alle Pfade, unter denen in `wert` eine Funktion steckt. Rekursiv. */
function funktionsPfade(wert: unknown, pfad = "$"): string[] {
  if (typeof wert === "function") return [pfad];
  if (Array.isArray(wert)) return wert.flatMap((v, i) => funktionsPfade(v, `${pfad}[${i}]`));
  // Nur einfache Objekte durchsuchen. Alles andere (Date, Map, Klasseninstanz)
  // ueberquert die Grenze ohnehin nicht unveraendert und hat im Katalog nichts
  // zu suchen – der Fall unten schlaegt an, sobald doch eines auftaucht.
  if (wert !== null && typeof wert === "object") {
    return Object.entries(wert as Record<string, unknown>).flatMap(([k, v]) =>
      funktionsPfade(v, `${pfad}.${k}`)
    );
  }
  return [];
}

const ALLE_FELDER = KATALOG.flatMap((s) => s.felder.map((feld) => ({ seite: s.id, feld })));

describe("Requisiten ueber die Server/Client-Grenze", () => {
  it("der Katalog hat ueberhaupt Felder – sonst prueft der Fall unten nichts", () => {
    expect(ALLE_FELDER.length).toBeGreaterThan(50);
  });

  it("kein einziges Anzeigefeld traegt irgendwo eine Funktion", () => {
    const funde = ALLE_FELDER.flatMap(({ seite, feld }) =>
      funktionsPfade(fuerAnzeige(feld)).map((p) => `${seite}.${feld.id}: ${p}`)
    );
    expect(
      funde,
      "Funktion in einer Requisite – React wirft beim echten Request, nicht im Test. " +
        "Das Feld gehoert nicht in AnzeigeFeld (siehe src/lib/self-disclosure/anzeige.ts)."
    ).toEqual([]);
  });

  it("ein ROHES Katalogfeld besteht dieselbe Pruefung NICHT", () => {
    // Ohne diesen Fall behauptet der obige etwas, das ohnehin gilt: Traefe
    // `funktionsPfade` gar nichts mehr (kaputte Rekursion, umbenanntes
    // `sichtbar`), bliebe alles still gruen.
    const mitBedingung = ALLE_FELDER.find(({ feld }) => feld.sichtbar);
    expect(mitBedingung, "Kein Feld traegt mehr eine Bedingung – Katalog umgebaut?").toBeTruthy();
    expect(funktionsPfade(mitBedingung!.feld)).toContain("$.sichtbar");
  });

  it("laesst ziel, sichtbar und abhaengigVon gar nicht erst mitreisen", () => {
    // `ziel` waere serialisierbar, hat in der Anzeige aber nichts zu suchen:
    // Wohin eine Antwort im Fall gehoert, ist keine Frage der Darstellung.
    const mitAllem = ALLE_FELDER.find(
      ({ feld }) => feld.sichtbar && feld.ziel && feld.abhaengigVon
    )!;
    expect(mitAllem).toBeTruthy();
    const schluessel = Object.keys(fuerAnzeige(mitAllem.feld));
    for (const verboten of ["ziel", "sichtbar", "abhaengigVon"]) {
      expect(schluessel, `${verboten} gehoert nicht ueber die Grenze`).not.toContain(verboten);
    }
  });

  it("uebernimmt Bezeichnung, Typ, Hinweis und Optionen unveraendert", () => {
    // Die Gegenrichtung: Ein Anzeigefeld, das zu wenig traegt, waere kein
    // Fortschritt – dann fehlte dem Kunden die Frage oder ihre Auswahl.
    const mitOptionen = ALLE_FELDER.find(({ feld }) => feld.optionen?.length && feld.hinweis)!;
    const anzeige = fuerAnzeige(mitOptionen.feld);
    expect(anzeige.id).toBe(mitOptionen.feld.id);
    expect(anzeige.label).toBe(mitOptionen.feld.label);
    expect(anzeige.typ).toBe(mitOptionen.feld.typ);
    expect(anzeige.hinweis).toBe(mitOptionen.feld.hinweis);
    expect(anzeige.optionen).toEqual(mitOptionen.feld.optionen);
  });
});
