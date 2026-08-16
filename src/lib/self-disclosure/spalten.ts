import type { AnzeigeFeld } from "@/lib/self-disclosure/anzeige";

/**
 * Die Spaltenregeln der Personenseiten – bewusst OHNE React und OHNE Katalog.
 *
 * Zwei Gruende, warum das ein eigenes Modul ist und weder in `step-form.tsx`
 * noch in `navigation.ts` steht:
 *
 *  1. `step-form.tsx` traegt "use client". Next ersetzt jedes Client-Modul im
 *     Server-Graph durch einen Proxy: Jeder benannte Export wird zu einer
 *     Client-Referenz, die beim AUFRUF wirft ("Attempted to call
 *     spaltenPersonen() from the server"). Die Schrittseite ist eine
 *     Server-Komponente und ruft `spaltenPersonen` auf – das warf bei jedem
 *     echten Request. Weder `tsc` noch ein Test sieht das: Der Test importiert
 *     das Modul direkt, wo es keinen Flight-Loader gibt.
 *  2. `navigation.ts` importiert den KATALOG (rund 700 Zeilen Fragen, Optionen
 *     und Hinweise). Solange `personenSchluessel` dort stand, zog die
 *     Client-Komponente `schritt-felder.tsx` den ganzen Katalog ins Buendel der
 *     oeffentlichen Kundenstrecke – fuer eine Funktion, die zwei Strings
 *     zusammensetzt.
 *
 * Wer hier etwas ergaenzt, haelt es katalogfrei und framework-frei.
 */

/**
 * Antwortschlüssel mit Personen-Präfix, wo einer nötig ist.
 *
 * Der Präfix steht seit den Spalten nicht mehr in der Schritt-ID: Ein Schritt
 * erscheint einmal und trägt beide Personen. Gebaut wird er deshalb hier.
 */
export function personenSchluessel(schrittId: string, feldId: string, person?: 1 | 2): string {
  return person ? `p${person}.${schrittId}.${feldId}` : `${schrittId}.${feldId}`;
}

/**
 * Welche Person(en) SchrittFelder bekommt.
 *
 * Exportiert, damit ein Test bewacht, dass diese Liste zu dem Präfix passt,
 * den `defaults` (Schrittseite) und `schrittSchema` (Server-Aktion) für
 * denselben Schritt erwarten: `schritt.personen` fehlt bei Schritten ohne
 * Personenbezug (EIN Aufruf ohne Präfix); bei `personenSpalten` UND nur einem
 * Antragsteller ist es `[1]` – auch dann EIN Aufruf, aber MIT Präfix "p1.".
 * Nur bei zwei Spalten wird wirklich zweimal gerendert. Wer hier eine Spalte
 * ohne Person rendert, obwohl der Schritt personenSpalten trägt, erzeugt
 * Formularnamen ohne Präfix – die Antwort verschwindet dann lautlos hinter
 * `schrittSchema.strip()` (siehe schema.ts).
 */
export function spaltenPersonen(personen?: (1 | 2)[]): Array<1 | 2 | undefined> {
  return (personen?.length ?? 0) > 1 ? personen! : [personen?.[0]];
}

/**
 * Eine Spalte des Schritts: die Person und die Felder, die GENAU SIE sieht.
 *
 * Die Feldliste haengt seit dem Katalogschnitt an der Spalte, nicht mehr am
 * Schritt: Auf "Was machen Sie beruflich?" bekommt der angestellte Partner die
 * Arbeitgeber-, die selbstaendige Partnerin die Firmenfragen. Eine gemeinsame
 * Liste fuer beide Spalten fragte eine von beiden nach dem Falschen – und ihre
 * Antworten landeten als falsche `employment`-Werte im Fall.
 *
 * `AnzeigeFeld` und nicht `Feld`: Diese Struktur wird als Requisite an eine
 * Client-Komponente gereicht. `Feld` traegt Funktionen, und die zerbrechen an
 * der Serialisierungsgrenze – genau daran ist die Produktion einmal gestorben
 * (siehe anzeige.ts).
 */
export interface Spalte {
  person?: 1 | 2;
  felder: AnzeigeFeld[];
}

/**
 * Traegt diese Spalte eine Ueberschrift ("Sie" / "Mitantragsteller/in")?
 *
 * Zwei Spalten nebeneinander brauchen sie offensichtlich. Der Fund war die
 * EINZELNE Spalte: `SichtbarerSchritt.personen` ist eine echte Teilmenge – bei
 * "Person 1 Rentnerin, Person 2 angestellt" traegt die Berufsseite
 * `personen === [2]`, also eine einzige Spalte, die stumm die Fragen des
 * Partners zeigt. Ohne Ueberschrift traegt die Rentnerin dort ihre eigenen
 * Angaben ein, und sie landen beim zweiten Antragsteller.
 *
 * Bei nur EINEM Antragsteller bleibt die Ueberschrift weg: "Sie" ueber der
 * einzigen Spalte des einzigen Antragstellers erklaert nichts und macht die
 * Seite nur voller.
 */
export function zeigeSpaltenUeberschrift(
  spaltenAnzahl: number,
  person: 1 | 2 | undefined,
  zweiAntragsteller: boolean
): boolean {
  if (spaltenAnzahl > 1) return true;
  return person !== undefined && zweiAntragsteller;
}
