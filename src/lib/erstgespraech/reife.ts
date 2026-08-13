import type { Fallstand } from "@/lib/self-disclosure/takeover";
import { PROPERTY_TYPES, type EmploymentType, type FinancingType, type PropertyType } from "@/lib/domain/enums";

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

/**
 * Objektarten mit eigenem Grund und Boden – also alle ausser der
 * Eigentumswohnung, deren Kaeufer nur einen Miteigentumsanteil erwirbt.
 *
 * Bewusst aus PROPERTY_TYPES ABGELEITET statt aufgezaehlt: Kommt eine
 * Objektart hinzu, zaehlt die Grundstuecksgroesse fuer sie erst einmal mit.
 * Das ist die sichere Richtung – eine zu viel gestellte Frage faellt auf, eine
 * still verschwundene nicht. Gleiches Prinzip wie bei der unbekannten
 * Beschaeftigungsart (siehe `Definition.nurBeiObjektart`).
 */
export const OBJEKTART_MIT_GRUNDSTUECK: PropertyType[] = PROPERTY_TYPES.filter(
  (a) => a !== "eigentumswohnung"
);

/** Bebaute Objektarten – ein unbebautes Grundstueck hat weder Wohnflaeche noch Baujahr. */
export const OBJEKTART_BEBAUT: PropertyType[] = PROPERTY_TYPES.filter((a) => a !== "grundstueck");

/**
 * Finanzierungsarten, bei denen ueberhaupt etwas gekauft wird – nur dort gibt
 * es einen Kaufpreis und eine Maklerprovision.
 *
 * Hier eine geschlossene Aufzaehlung statt einer Ableitung: "Kauf" ist ein
 * enger Begriff, und eine kuenftige Art (etwa ein Forward-Darlehen) waere
 * eher KEIN Kauf. Entspricht dem KAUFZWEIG des Fragenkatalogs.
 *
 * Innerhalb des Kaufzweigs wird nichts ausgeblendet: Provisionsfrei ist eine
 * 0, keine verschwundene Zeile – auch beim Bautraeger-Neubau (Entscheidung des
 * Vermittlers vom 13.08.2026).
 */
export const FINANZIERUNG_MIT_KAUF: FinancingType[] = ["kauf", "neubau"];

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
  /**
   * Die Angabe gilt nur fuer diese Objektarten – dieselbe Regel wie oben:
   * Eine UNBEKANNTE Objektart zaehlt mit, weil die Objektart selbst eine der
   * Angaben ist und leer sein darf.
   */
  nurBeiObjektart?: PropertyType[];
  /** Die Angabe gilt nur fuer diese Finanzierungsarten; unbekannt zaehlt mit. */
  nurBeiFinanzierungsart?: FinancingType[];
}

/**
 * Die angebotsrelevanten Angaben, bestaetigt von Juergen am 12.08.2026.
 *
 * 26 Definitionen – die tatsaechliche ANZAHL je Fall haengt aber an der Zahl
 * der Antragsteller (`jePerson`), an der Beschaeftigungsart
 * (`nurBeiBeschaeftigung`) und seit dem 13.08.2026 auch an Objektart und
 * Finanzierungsart (`nurBeiObjektart`, `nurBeiFinanzierungsart`). Wer die Zahl
 * irgendwo anzeigt, muss sie deshalb aus `berechneReife` nehmen, nie fest
 * hinschreiben.
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
  { schluessel: "wohnflaeche", label: "Wohnfläche", abschnitt: "objekt", quelle: "property", nurBeiObjektart: OBJEKTART_BEBAUT },
  {
    schluessel: "grundstuecksflaeche",
    label: "Grundstücksgröße",
    abschnitt: "objekt",
    quelle: "property",
    nurBeiObjektart: OBJEKTART_MIT_GRUNDSTUECK,
  },
  { schluessel: "baujahr", label: "Baujahr", abschnitt: "objekt", quelle: "property", nurBeiObjektart: OBJEKTART_BEBAUT },
  { schluessel: "nutzung", label: "Nutzung", abschnitt: "objekt", quelle: "property" },
  { schluessel: "financingType", label: "Finanzierungsart", abschnitt: "vorhaben", quelle: "case" },
  {
    schluessel: "kaufpreis",
    label: "Kaufpreis",
    abschnitt: "vorhaben",
    quelle: "financingRequest",
    nurBeiFinanzierungsart: FINANZIERUNG_MIT_KAUF,
  },
  {
    schluessel: "maklerprovisionProzent",
    label: "Maklerprovision",
    abschnitt: "vorhaben",
    quelle: "financingRequest",
    nurBeiFinanzierungsart: FINANZIERUNG_MIT_KAUF,
  },
  { schluessel: "darlehenswunsch", label: "Darlehenswunsch", abschnitt: "vorhaben", quelle: "financingRequest" },
  { schluessel: "zinsbindungJahre", label: "Zinsbindung", abschnitt: "vorhaben", quelle: "financingRequest" },
  { schluessel: "sondertilgungProzentJaehrlich", label: "Sondertilgung", abschnitt: "vorhaben", quelle: "financingRequest" },
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
 * Gilt eine gebundene Angabe bei diesem Merkmal (Beschaeftigungs-, Objekt-
 * oder Finanzierungsart)?
 *
 * Solange das Merkmal unbekannt ist, JA – siehe `Definition`.
 */
function gilt(erlaubt: readonly string[], merkmal: unknown): boolean {
  if (typeof merkmal !== "string" || merkmal === "") return true;
  return erlaubt.includes(merkmal);
}

/**
 * Alle Zielspalten, die ueberhaupt angebotsrelevant sind – ungefiltert.
 *
 * Die Maske braucht die Liste, um die Gegenrichtung zu `ergaenzeUnerreichbare`
 * zu bilden: Steht eine Zielspalte hier drin, wird aber fuer DIESEN Fall nicht
 * gezaehlt, dann ist sie weggefallen (die Eigentumswohnung hat kein
 * Grundstueck) – und die Maske darf sie auch nicht fragen. Ohne diese Liste
 * liesse sich "weggefallen" nicht von "war nie angebotsrelevant" (Warmmiete,
 * Baukosten) unterscheiden.
 */
export const ANGEBOTSRELEVANTE_ZIELE: ReadonlySet<string> = new Set(
  FELDER.map((d) => `${d.quelle}.${d.schluessel}`)
);

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
      // Angaben, die es in diesem Fall nicht gibt – der Arbeitsvertrag eines
      // Rentners, das Grundstueck einer Eigentumswohnung, der Kaufpreis einer
      // Anschlussfinanzierung –, werden weder gezaehlt noch gefragt:
      // `baueMaske` folgt dieser Liste in BEIDE Richtungen (ergaenzt fehlende
      // Katalogschritte, laesst weggefallene Felder weg).
      if (
        def.nurBeiBeschaeftigung &&
        !gilt(def.nurBeiBeschaeftigung, lies("employment", "beschaeftigungsart", position))
      ) {
        continue;
      }
      if (def.nurBeiObjektart && !gilt(def.nurBeiObjektart, stand.property?.objektart)) continue;
      if (
        def.nurBeiFinanzierungsart &&
        !gilt(def.nurBeiFinanzierungsart, stand.caseFelder.financingType)
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
