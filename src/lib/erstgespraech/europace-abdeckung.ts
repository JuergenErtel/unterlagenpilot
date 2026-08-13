/**
 * Welche der 26 Reife-Angaben (`berechneReife`) tatsaechlich am
 * Europace-Mapping ankommen (`src/lib/platforms/europace/kundenangaben-mapping.ts`).
 *
 * Fund A2 (Schlusspruefung 12.08.2026): Die Uebergabe-Kopiermaske zeigte alle
 * 26 Angaben und den Uebertragen-Knopf direkt darunter, als wuerde die
 * API-Uebertragung alles davon mitnehmen. Acht Angaben erreicht Europace nie,
 * weil `kundenangaben-mapping.ts` sie schlicht nicht kennt -- der Vermittler
 * bekam "Übertragen" gemeldet und suchte die Angaben danach vergeblich im
 * Europace-Vorgang.
 *
 * Handgepflegte Gegenliste statt automatischer Ableitung: Der Mapping-Layer
 * bildet auf ein tief verschachteltes, polymorphes Europace-Schema ab
 * (z. B. "@type"-Objekte) -- daraus laesst sich "Feld X wird uebertragen"
 * nicht zuverlaessig zurueckrechnen. Bei jeder Aenderung an
 * kundenangaben-mapping.ts MUSS diese Liste von Hand nachgezogen werden; der
 * Test (`tests/europace-abdeckung.test.ts`) haelt nur den aktuellen Stand
 * fest, erkennt eine kuenftige Abweichung aber nur, wenn er dabei mitgepflegt
 * wird.
 */
const NIE_UEBERTRAGENE_SCHLUESSEL = new Set<string>([
  // Die Gruppe "Konditionswunsch" (Zinsbindung, Sondertilgung, Wunschrate)
  // stand bis zum 13.08.2026 hier: Das Mapping kannte `annuitaetendetails`
  // nicht. Seitdem gehen alle drei mit -- die Annahme "Europaces
  // Finanzierungsbedarf-Schema kennt sie nicht" war schlicht falsch.
  // haushalte[].kunden kennt kein Kinderfeld im Request.
  "anzahlKinder",
  // finanzierungsobjekt() mappt Objektart und Adresse, aber keine Nutzung
  // (Eigennutzung/Vermietung/Kapitalanlage).
  "nutzung",
  // finanzielles kennt nur einkommenNetto, keine weiteren Einkuenfte.
  "sonstigeEinnahmen",
  // beschaeftigung() liest nur "inProbezeit", nie "befristet".
  "befristet",
]);

/**
 * Ob eine Angabe mit ihrem aktuellen Rohwert die Übertragung nach Europace
 * erreicht. `inProbezeit` ist ein Sonderfall: `beschaeftigung()` im Mapping
 * sendet den Wert NUR, wenn er `true` ist -- ein "nein" ist von "nie
 * gefragt" nicht unterscheidbar (DB-Spalte NOT NULL, Standard `false`) und
 * wird deshalb bewusst weggelassen, statt eine unsichere Tatsache zu
 * behaupten. Ein "ja" dagegen entsteht nur durch eine explizite Antwort und
 * wird gesendet.
 */
export function erreichtEuropaceNie(schluessel: string, rohWert: unknown): boolean {
  if (schluessel === "inProbezeit") return rohWert !== true;
  return NIE_UEBERTRAGENE_SCHLUESSEL.has(schluessel);
}
