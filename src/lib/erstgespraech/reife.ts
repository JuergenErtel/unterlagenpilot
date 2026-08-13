import type { Fallstand } from "@/lib/self-disclosure/takeover";
import type { EmploymentType } from "@/lib/domain/enums";

/**
 * Welche der angebotsrelevanten Angaben stehen, welche fehlen.
 *
 * Reine Funktion ueber dem Fallstand: Die Reife wird bei jedem Aufruf frisch
 * gerechnet und kann deshalb nicht veralten. Sie INFORMIERT nur – kein Feld
 * blockiert (bindende Zusicherung der Spezifikation).
 */
export interface ReifeFeld {
  schluessel: string;
  label: string;
  abschnitt: string;
  gefuellt: boolean;
  person?: 1 | 2;
  /**
   * Die Tabelle, in der die Angabe steht. Ohne sie ist ein Feld nicht
   * eindeutig: "zip" gibt es beim Antragsteller UND beim Objekt, "street"
   * ebenso. Die gefuehrte Maske ordnet ihre Eingabefelder darueber zu.
   */
  quelle: Quelle;
}

export interface Reife {
  felder: ReifeFeld[];
  gefuellt: number;
  gesamt: number;
}

export type Quelle =
  | "applicant"
  | "employment"
  | "income"
  | "property"
  | "financingRequest"
  | "case";

/**
 * Beschaeftigungsarten, bei denen es einen Arbeitsvertrag ueberhaupt geben
 * kann – und damit ein Eintrittsdatum, eine Befristung und eine Probezeit.
 *
 * Bewusst eine Positivliste OHNE selbststaendiger/freiberufler/
 * geschaeftsfuehrer/gesellschafter/rentner: Wer nicht angestellt ist, hat
 * keinen Arbeitsvertrag, und die Maske fragte ihn trotzdem "Beschaeftigt
 * seit?", "Arbeitsvertrag befristet?", "In Probezeit?".
 *
 * "sonstiges" bleibt DRIN: Das ist die Antwort "keine der Kategorien passt",
 * nicht die Aussage "kein Arbeitsvertrag" – ein Minijob faellt z. B. hierher.
 *
 * ACHTUNG, die gleichnamige Liste in `checklists/templates.ts` ist NICHT
 * dieselbe und darf nicht angeglichen werden: Dort geht es um
 * Gehaltsabrechnungen, und die fuehrt ein Geschaeftsfuehrer oder
 * Gesellschafter sehr wohl vor (er bezieht ein Gehalt aus seiner eigenen
 * Gesellschaft) – beide stehen deshalb dort in der Positivliste. Ein
 * ARBEITSVERTRAG mit Befristung und Probezeit ist dagegen genau das, was ihn
 * vom Angestellten unterscheidet; hier bleiben beide draussen. Gemeinsam ist
 * den Listen nur die Regel fuer die unbekannte Beschaeftigungsart (siehe
 * `Definition.nurBeiBeschaeftigung`), nicht ihr Inhalt.
 */
export const BESCHAEFTIGUNG_MIT_ARBEITSVERTRAG: EmploymentType[] = [
  "angestellter",
  "beamter",
  "sonstiges",
];

interface Definition {
  schluessel: string;
  label: string;
  abschnitt: string;
  quelle: Quelle;
  /** Wird je Antragsteller gezaehlt. */
  jePerson?: boolean;
  /**
   * Die Angabe gilt nur fuer diese Beschaeftigungsarten – sonst wird sie weder
   * gezaehlt noch (ueber `ergaenzeUnerreichbare` in maske.ts) gefragt.
   *
   * Eine UNBEKANNTE Beschaeftigungsart zaehlt mit: Die Beschaeftigungsart ist
   * selbst eine der Angaben und darf leer sein. Wuerde die Angabe schon
   * vorher verschwinden, fiele sie still weg, bevor der Vermittler ueberhaupt
   * gefragt hat. Genau diese Regel gilt im Bestand bereits fuer die
   * Unterlagenliste (`nurBeiBeschaeftigung`, checklists/templates.ts).
   */
  nurBeiBeschaeftigung?: EmploymentType[];
}

/**
 * Die angebotsrelevanten Angaben, bestaetigt von Juergen am 12.08.2026.
 *
 * 26 Definitionen – die tatsaechliche ANZAHL je Fall haengt aber an der Zahl
 * der Antragsteller (`jePerson`) und seit dem 13.08.2026 auch an der
 * Beschaeftigungsart (`nurBeiBeschaeftigung`). Wer die Zahl irgendwo anzeigt,
 * muss sie deshalb aus `berechneReife` nehmen, nie fest hinschreiben.
 */
const FELDER: Definition[] = [
  { schluessel: "vorname", label: "Vorname", abschnitt: "person", quelle: "applicant", jePerson: true },
  { schluessel: "nachname", label: "Nachname", abschnitt: "person", quelle: "applicant", jePerson: true },
  { schluessel: "geburtsdatum", label: "Geburtsdatum", abschnitt: "person", quelle: "applicant", jePerson: true },
  { schluessel: "staatsangehoerigkeit", label: "Staatsangehörigkeit", abschnitt: "person", quelle: "applicant", jePerson: true },
  { schluessel: "beschaeftigungsart", label: "Beschäftigungsart", abschnitt: "beruf", quelle: "employment", jePerson: true },
  {
    schluessel: "inProbezeit",
    label: "Probezeit",
    abschnitt: "beruf",
    quelle: "employment",
    jePerson: true,
    nurBeiBeschaeftigung: BESCHAEFTIGUNG_MIT_ARBEITSVERTRAG,
  },
  {
    schluessel: "befristet",
    label: "Befristet",
    abschnitt: "beruf",
    quelle: "employment",
    jePerson: true,
    nurBeiBeschaeftigung: BESCHAEFTIGUNG_MIT_ARBEITSVERTRAG,
  },
  { schluessel: "nettoMonatlich", label: "Nettoeinkommen", abschnitt: "beruf", quelle: "income", jePerson: true },
  { schluessel: "sonstigeEinnahmen", label: "Weitere Einkünfte", abschnitt: "beruf", quelle: "income", jePerson: true },
  { schluessel: "street", label: "Anschrift", abschnitt: "person", quelle: "applicant" },
  { schluessel: "familienstand", label: "Familienstand", abschnitt: "person", quelle: "applicant" },
  { schluessel: "anzahlKinder", label: "Kinder im Haushalt", abschnitt: "haushalt", quelle: "applicant" },
  { schluessel: "eigenkapital", label: "Eigenkapital", abschnitt: "eigenkapital", quelle: "financingRequest" },
  { schluessel: "objektart", label: "Objektart", abschnitt: "objekt", quelle: "property" },
  { schluessel: "zip", label: "PLZ des Objekts", abschnitt: "objekt", quelle: "property" },
  { schluessel: "wohnflaeche", label: "Wohnfläche", abschnitt: "objekt", quelle: "property" },
  { schluessel: "grundstuecksflaeche", label: "Grundstücksgröße", abschnitt: "objekt", quelle: "property" },
  { schluessel: "baujahr", label: "Baujahr", abschnitt: "objekt", quelle: "property" },
  { schluessel: "nutzung", label: "Nutzung", abschnitt: "objekt", quelle: "property" },
  { schluessel: "financingType", label: "Finanzierungsart", abschnitt: "vorhaben", quelle: "case" },
  { schluessel: "kaufpreis", label: "Kaufpreis", abschnitt: "vorhaben", quelle: "financingRequest" },
  { schluessel: "maklerprovisionProzent", label: "Maklerprovision", abschnitt: "vorhaben", quelle: "financingRequest" },
  { schluessel: "darlehenswunsch", label: "Darlehenswunsch", abschnitt: "vorhaben", quelle: "financingRequest" },
  { schluessel: "zinsbindungJahre", label: "Zinsbindung", abschnitt: "vorhaben", quelle: "financingRequest" },
  { schluessel: "sondertilgungGewuenscht", label: "Sondertilgung gewünscht", abschnitt: "vorhaben", quelle: "financingRequest" },
  { schluessel: "wunschrateMonatlich", label: "Wunschrate", abschnitt: "vorhaben", quelle: "financingRequest" },
];

/**
 * Nur null, undefined und der leere String sind Luecken.
 *
 * 0 und false sind ANTWORTEN: "keine Maklerprovision" und "keine
 * Sondertilgung gewuenscht" duerfen nicht als offen gelten, sonst fragt das
 * Interview ewig nach etwas, das schon beantwortet ist.
 *
 * Deshalb zaehlen "inProbezeit" und "befristet" ab jetzt IMMER als gefuellt:
 * beide sind Boolean-Spalten NOT NULL mit Vorgabe false, und die Vorgabe
 * "nein" IST die Antwort (Entscheidung des Vermittlers vom 13.08.2026) – wer
 * es anders hat, kreuzt aktiv um. Vorher stand hier "befristetBis" (ein
 * Datum): Wer unbefristet beschaeftigt oder selbstaendig ist, hat dort nie
 * etwas stehen, und die Leiste konnte "vollstaendig" fuer die Mehrheit der
 * Faelle nie erreichen. Das Ankreuzfeld loest das auf.
 */
function istGefuellt(wert: unknown): boolean {
  return wert !== null && wert !== undefined && wert !== "";
}

/**
 * Gilt eine an die Beschaeftigungsart gebundene Angabe fuer diese Person?
 *
 * Solange die Beschaeftigungsart unbekannt ist, JA – siehe
 * `Definition.nurBeiBeschaeftigung`.
 */
function giltBeiBeschaeftigung(erlaubt: EmploymentType[], art: unknown): boolean {
  if (typeof art !== "string" || art === "") return true;
  return (erlaubt as string[]).includes(art);
}

export function berechneReife(stand: Fallstand, antragstellerZahl: number): Reife {
  const personen = Math.max(antragstellerZahl, 1);
  const felder: ReifeFeld[] = [];

  const lies = (quelle: Quelle, schluessel: string, position: number): unknown => {
    if (quelle === "case") return stand.caseFelder[schluessel];
    if (quelle === "property") return stand.property?.[schluessel];
    if (quelle === "financingRequest") return stand.financingRequest?.[schluessel];
    const person = stand.applicants.find((a) => a.position === position);
    if (!person) return undefined;
    if (quelle === "applicant") return person[schluessel];
    // employment und income haengen als Liste am Antragsteller; der erste
    // Satz ist der aktuelle (so laedt ihn auch die Fallseite).
    const liste = person[quelle] as Array<Record<string, unknown>> | undefined;
    return liste?.[0]?.[schluessel];
  };

  for (const def of FELDER) {
    const positionen = def.jePerson ? Array.from({ length: personen }, (_, i) => i + 1) : [1];
    for (const position of positionen) {
      // Angaben, die es fuer diese Beschaeftigungsart nicht gibt (Arbeitsvertrag
      // eines Rentners), werden weder gezaehlt noch gefragt: `baueMaske` holt
      // sich ueber `ergaenzeUnerreichbare` genau die Katalogschritte, die die
      // hier gezaehlten Angaben tragen.
      if (
        def.nurBeiBeschaeftigung &&
        !giltBeiBeschaeftigung(def.nurBeiBeschaeftigung, lies("employment", "beschaeftigungsart", position))
      ) {
        continue;
      }
      felder.push({
        schluessel: def.schluessel,
        label: def.label,
        abschnitt: def.abschnitt,
        gefuellt: istGefuellt(lies(def.quelle, def.schluessel, position)),
        person: def.jePerson ? (position as 1 | 2) : undefined,
        quelle: def.quelle,
      });
    }
  }

  return {
    felder,
    gefuellt: felder.filter((f) => f.gefuellt).length,
    gesamt: felder.length,
  };
}
