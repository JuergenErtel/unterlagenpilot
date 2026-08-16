import type { Feld, FeldTyp } from "@/lib/self-disclosure/types";

/**
 * Was von einem Katalogfeld über die Server/Client-Grenze darf: REINE DATEN.
 *
 * Der Grund steht in einem Produktionsausfall: Seit dem Katalogschnitt trägt
 * `Feld` Funktionen (`sichtbar`, und je Feld eine eigene). Server-Komponenten
 * reichten `Feld`-Objekte unverändert an Client-Komponenten weiter
 * (`EinstiegFormular`, `StepForm`) – React kann Funktionen nicht serialisieren
 * und wirft. `https://baufidesk.de/anfrage/ertel` antwortete mit HTTP 500, und
 * die gesamte Selbstauskunfts-Strecke war ebenso tot. Vor dem Schnitt war
 * `Feld` reine Datenbeschreibung, deshalb ging es jahrelang gut.
 *
 * Warum nichts es fing: `tsc` kennt die Serialisierungsgrenze nicht, Vitest
 * rendert sie nicht, und der Wächter über den Importgraphen
 * (`tests/rsc-grenze.test.ts`) prüft IMPORTE, nicht REQUISITEN – eine andere
 * Fehlerklasse. Der Wächter dafür ist `tests/anzeige-serialisierbar.test.ts`.
 *
 * Deshalb ist dies ein eigener Typ und keine Teilmenge per `Omit<Feld, …>`:
 * Ein `Omit` nimmt weg, was man aufzählt, und lässt alles Neue durch. Wer
 * morgen ein zweites Funktionsfeld an `Feld` hängt, bekäme mit `Omit` wieder
 * einen stillen Durchgang. Hier muss er es ausdrücklich hinzufügen.
 */
export interface AnzeigeFeld {
  id: string;
  label: string;
  typ: FeldTyp;
  hinweis?: string;
  optionen?: { wert: string; label: string }[];
}

/**
 * Ein Katalogfeld auf das reduzieren, was die Darstellung braucht.
 *
 * Baut ein NEUES Objekt aus benannten Feldern – kein Spread mit
 * anschließendem Löschen. Nur so kann nichts mitwandern, das später
 * dazukommt. Bewusst NICHT dabei: `sichtbar` und `abhaengigVon` (Funktionen
 * bzw. reine Katalogverwaltung) und `ziel` – letzteres wäre zwar
 * serialisierbar, aber wohin eine Antwort im Fall gehört, ist keine Frage der
 * Anzeige. Die Optionen werden mitkopiert, damit auch dort nichts
 * Unerwartetes durchrutscht.
 */
export function fuerAnzeige(feld: Feld): AnzeigeFeld {
  return {
    id: feld.id,
    label: feld.label,
    typ: feld.typ,
    hinweis: feld.hinweis,
    optionen: feld.optionen?.map((o) => ({ wert: o.wert, label: o.label })),
  };
}
