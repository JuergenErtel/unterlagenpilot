import { describe, expect, it } from "vitest";
import { KATALOG } from "@/lib/self-disclosure/catalog";
import type { Antworten, Feld, Schritt } from "@/lib/self-disclosure/types";

/**
 * Die dauerhafte Bremse gegen den teuersten Fehler des Katalogschnitts.
 *
 * Was passiert war: `objekt_preis.makler_hoehe` hing an `objekt_preis.makler`
 * – Steuerantwort und abhaengiges Feld auf DERSELBEN Seite. Der Server rechnet
 * die Feldliste VOR dem Absenden, es gibt keine clientseitige Neuauswertung,
 * und `speichereAntwort` springt danach auf die FOLGENDE Seite, nie zurueck auf
 * dieselbe. Wer "Ja, es faellt eine Maklergebuehr an" waehlte, bekam das
 * Prozentfeld im Ablauf also NIE zu sehen. Vor dem Schnitt war das ein eigener
 * Schritt direkt hinter der Ja/Nein-Frage und funktionierte.
 *
 * Teuer ist das, weil es nicht auffaellt: Fehlt der Wert, rechnet die
 * Machbarkeit mit 0 % Courtage. Die Ampel wird nicht grau, sondern zu
 * OPTIMISTISCH – bei 400.000 EUR Kaufpreis fehlen rund 14.000 EUR Nebenkosten.
 * Genau die Zahl, nach der die Leads sortiert werden.
 *
 * Deshalb deklariert jedes Feld mit `sichtbar` per `abhaengigVon`, an welchem
 * Antwortschluessel seine Bedingung haengt. Die Angabe dient AUSSCHLIESSLICH
 * diesem Test – ausgewertet wird weiterhin die Funktion.
 */

const SEITE = new Map(KATALOG.map((s) => [s.id, s]));

/** "p2.personen.beruf_art" -> "personen"; "vorhaben.art" -> "vorhaben". */
function seiteVon(schluessel: string): string {
  const teile = schluessel.replace(/^p[12]\./, "").split(".");
  return teile[0] ?? "";
}

/** Das Feld, auf das ein `abhaengigVon`-Schluessel zeigt – oder null. */
function steuerfeld(schluessel: string): { seite: Schritt; feld: Feld } | null {
  const ohnePraefix = schluessel.replace(/^p[12]\./, "");
  const [seiteId, feldId] = ohnePraefix.split(".");
  const seite = seiteId ? SEITE.get(seiteId) : undefined;
  const feld = seite?.felder.find((f) => f.id === feldId);
  return seite && feld ? { seite, feld } : null;
}

const mitBedingung = KATALOG.flatMap((seite) =>
  seite.felder.filter((f) => f.sichtbar).map((feld) => ({ seite, feld }))
);

describe("Feldbedingungen", () => {
  it("es gibt ueberhaupt Felder mit Bedingung", () => {
    // Sonst waeren alle Faelle unten leer erfuellt.
    expect(mitBedingung.length).toBeGreaterThan(0);
  });

  for (const { seite, feld } of mitBedingung) {
    describe(`${seite.id}.${feld.id}`, () => {
      it("deklariert, an welcher Antwort seine Bedingung haengt", () => {
        expect(feld.abhaengigVon, `${seite.id}.${feld.id} traegt sichtbar ohne abhaengigVon`)
          .toBeTruthy();
      });

      it("die deklarierte Steuerantwort gibt es im Katalog", () => {
        expect(steuerfeld(feld.abhaengigVon ?? ""), `${feld.abhaengigVon} zeigt ins Leere`).toBeTruthy();
      });

      it("die Bedingung reagiert auch wirklich auf diese Antwort", () => {
        // Gegen eine veraltete Deklaration: Wer die Bedingung umschreibt und
        // `abhaengigVon` stehenlaesst, bekaeme sonst eine Angabe, die nur noch
        // wie eine Zusage aussieht.
        const steuer = steuerfeld(feld.abhaengigVon ?? "")!;
        const schluessel = steuer.seite.personenSpalten
          ? `p1.${steuer.seite.id}.${steuer.feld.id}`
          : `${steuer.seite.id}.${steuer.feld.id}`;
        const ohne = feld.sichtbar!({}, 1);
        const werte = (steuer.feld.optionen ?? []).map((o) => o.wert);
        expect(werte.length, `${feld.abhaengigVon} hat keine Optionen zum Durchprobieren`)
          .toBeGreaterThan(0);
        const kippt = werte.some((w) => {
          const a: Antworten = { [schluessel]: w };
          return feld.sichtbar!(a, 1) !== ohne;
        });
        expect(kippt, `keine Antwort auf ${feld.abhaengigVon} aendert die Sichtbarkeit`).toBe(true);
      });

      it("haengt nicht an einer Steuerantwort DERSELBEN Seite", () => {
        /*
         * Die eigentliche Zusage. Die Ausnahme ist eng und begruendet: Ein Feld,
         * das OHNE jede Antwort bereits sichtbar ist, wird beim ersten Aufruf
         * seiner Seite ohnehin gezeigt – die Bedingung kann es dort nur noch
         * ausblenden, nie erst freischalten. Genau so stehen "Stand der Suche"
         * und "Nutzung" neben der Finanzierungsart auf Seite 1 (`istKauf` gilt
         * auch ohne Antwort). Ein Feld, das ohne Antwort ZU ist, kann dagegen
         * auf derselben Seite nie aufgehen – das war der Maklerfehler.
         */
        const gleicheSeite = seiteVon(feld.abhaengigVon ?? "") === seite.id;
        const ohneAntwortSichtbar = feld.sichtbar!({}, 1);
        expect(
          gleicheSeite && !ohneAntwortSichtbar,
          `${seite.id}.${feld.id} wird erst durch ${feld.abhaengigVon} sichtbar – dieselbe Seite, im Ablauf unerreichbar`
        ).toBe(false);
      });
    });
  }
});
