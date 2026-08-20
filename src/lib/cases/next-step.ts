import type { Tone } from "@/lib/ui/tone";
import { LOCKED_CASE_STATUSES, type CaseStatus } from "@/lib/domain/enums";
import type { KontaktStand } from "@/lib/cases/kontakt";

/**
 * Der EINE nächste Schritt eines Falls – Herzstück der geführten Fallreise.
 * Wird prominent auf der Fallseite, im Review-Abschluss und (Etappe 2) im
 * Dashboard angezeigt. Die Prioritätsleiter ist bewusst total: es gibt immer
 * einen Schritt.
 */
export interface NextStep {
  key:
    | "ki_laeuft"
    | "ki_fehler"
    | "erstkontakt_email_fehlt"
    | "erstkontakt_vorbereiten"
    | "erstkontakt_entwurf"
    | "erstgespraech"
    | "kontakt_aufnehmen"
    | "wiedervorlage_faellig"
    | "vertrieb_laeuft"
    | "selbstauskunft_eingegangen"
    | "dokumente_freigeben"
    | "kundendaten"
    | "kritische_hinweise"
    | "machbarkeit"
    | "unterlagen_luecken"
    | "unterlagen_anfordern"
    | "selbstauskunft_wartet"
    | "fristen"
    | "erledigt"
    | "einreichung";
  title: string;
  reason: string;
  tone: Tone;
  /**
   * Primäraktion als Link. Fehlt bei ki_laeuft (Fortschritt), ki_fehler und
   * erstkontakt_vorbereiten (beide Server-Action-Form statt Link) sowie bei
   * kontakt_aufnehmen (der Anruf ist keine Seite, zu der ein Link führen
   * könnte).
   */
  cta?: { label: string; href: string };
  secondary?: Array<{ label: string; href: string }>;
  /**
   * Schritte, die bereit wären, aber von einem höher stehenden verdrängt
   * wurden. Die Leiter bleibt bewusst "ein Hauptschritt" – ohne diesen Hinweis
   * verschwand die Dokumentfreigabe jedoch spurlos, sobald irgendetwas darüber
   * rankte, und mit ihr der einzige Weg, die erkannten Daten in die Akte zu
   * bekommen (Fall UP-2026-0007). Nur Wegweiser, nie die Hauptaktion.
   */
  wartet?: Array<{ label: string; href: string }>;
  /**
   * Staerker hervorheben als die uebrigen Schritte.
   *
   * Die Entscheidung darueber gehoert hierher, nicht in die Anzeige: Sonst
   * muesste `NextStepCard` am Schluessel raten, welcher Schritt gerade wichtig
   * ist – und beim naechsten Umbau der Leiter faellt genau das auseinander.
   * Sparsam einsetzen: Wird alles hervorgehoben, ist es nichts mehr.
   */
  hervorgehoben?: boolean;
}

/**
 * Struktureller Ausschnitt aus CockpitData – so kann auch das Dashboard den
 * Schritt je Fall berechnen, ohne das komplette (teure) Cockpit zu laden.
 */
export interface NextStepInput {
  caseId: string;
  status: string;
  counts: {
    pruefbereit: number;
    docsMissing: number;
    criticals: number;
    docsFehler: number;
    docsLaufend: number;
    /** Offene Lücken des Unterlagen-Detektivs, vom Vermittler noch nicht gesichtet. */
    offeneBefunde: number;
    /**
     * Der Solver hatte genug Daten und sagt "nicht darstellbar". Bei dünner
     * Datenlage bleibt das false – sonst warnt die Leiter vor Fällen, über die
     * sie nichts weiß.
     */
    machbarkeitBlockiert: boolean;
  };
  missingCustomerFields: string[];
  /**
   * Vertriebsphase des Leads – die zweite Dimension neben `status`. Fehlt sie,
   * verhält sich die Leiter wie zuvor.
   *
   * Sie gehört hierher aus demselben Grund wie `verloren`: Sie ist KEIN
   * CaseStatus, und ohne sie sieht die Leiter nur die Unterlagenseite des
   * Falls. „Zusage" setzt ausschließlich der Vermittler von Hand
   * (`lead-phase.ts` schlägt sie bewusst nie vor) – ein Fall, den er dorthin
   * gezogen hat, ist hier fertig.
   */
  leadPhase?: string;
  /** Stand der Selbstauskunft; fehlt bei Fällen ohne Link. */
  selbstauskunft?: {
    eingegangen: boolean;
    begonnen: boolean;
    /** Tage seit Erstellung des Links; null, wenn kein Link existiert. */
    erstelltVorTagen: number | null;
  };
  /**
   * Stand des Erstkontakts. Fehlt dieser Block (z. B. weil ein Aufrufer ihn
   * nicht lädt), verhält sich die Leiter wie zuvor – ohne Erstkontakt-Stufen.
   * Ist er gesetzt und noch nicht `versendet`, sticht er alles unterhalb der
   * KI-Stufen: Der Erstkontakt ist der Weg, auf dem fehlende Kundendaten und
   * Unterlagen überhaupt erst angefordert werden – ihn zurückzuhalten, bis
   * z. B. das Geburtsdatum von Hand nachgetragen wurde, wäre ein Henne-Ei-
   * Problem. Sobald `versendet: true`, taucht keine Erstkontakt-Stufe mehr auf.
   *
   * MIT EINER AUSNAHME seit dem 14.08.2026: Das Erstgespraech steht davor,
   * solange der Erstkontakt nicht versendet ist. Der frische Lead gehoert ans
   * Telefon, nicht ins Postfach. Der Blocker "E-Mail-Adresse fehlt" bleibt
   * weiterhin ganz vorn.
   *
   * Seit derselben Aenderung (Task 3, Nachbesserung) ist NICHT mehr das
   * Erstgespraech die 1. Aufgabe nach Leadeingang, sondern `kontaktSchritt`
   * (`kontakt_aufnehmen`) – der steht in diesem Zweig noch VOR dem
   * Erstgespraech (siehe `ermittleSchritt`).
   */
  erstkontakt?: {
    /** Erste gültige E-Mail-Adresse unter den Antragstellern, falls vorhanden. */
    empfaenger: string | null;
    /** true, sobald ein Entwurf existiert (Upload- + Selbstauskunfts-Link, Nachricht). */
    vorbereitet: boolean;
    versendet: boolean;
  };
  /** Stand des Erstgespraechs; fehlt bei Aufrufern, die ihn nicht laden. */
  /**
   * `gefuehrtAm` gesetzt heisst: der Vermittler hat das Gespraech abgehakt.
   * Nicht "alle Angaben da" – die Reifeleiste zaehlt ~35, von denen etliche zu
   * Recht leer bleiben (keine weiteren Einkuenfte, kein Konditionswunsch).
   * Ohne den Haken bliebe die Leiter fuer immer auf dieser Stufe stehen und
   * verdeckte alles darunter, weil sie bauartbedingt nur EINEN Schritt zeigt.
   * Die offenen Angaben bleiben danach als wartender Schritt sichtbar.
   */
  erstgespraech?: { offeneAngaben: number; gefuehrtAm?: Date | null };
  /**
   * Stand der telefonischen Kontaktaufnahme. Fehlt der Block, verhaelt sich
   * die Leiter wie zuvor – ohne Kontaktstufen. Der Stand kommt fertig
   * gerechnet herein (`kontaktStand`), damit diese Datei ohne Uhr auskommt.
   */
  kontakt?: {
    stand: KontaktStand;
    /** Erste Nummer unter Antragsteller 1 bzw. Kunde; null, wenn keine da ist. */
    telefon: string | null;
  };
  /** Ob eine gesetzte Wiedervorlage heute faellig ist – vom Aufrufer gerechnet. */
  wiedervorlageFaellig?: boolean;
  /**
   * Fall als verloren markiert. Bewusst ein eigenes Feld: "verloren" ist KEIN
   * CaseStatus, sondern `verlorenAm` am Fall – `LOCKED_CASE_STATUSES` fangen
   * es also nicht ab.
   */
  verloren?: boolean;
}

/**
 * Phasen, ab denen der Fall außerhalb von BaufiDesk geführt wird – samt dem
 * Satz, der dann auf der Karte steht. Reihenfolge und Auswahl sind Jürgens
 * Entscheidung vom 15.08.2026: ab dem Finanzierungsvorschlag.
 */
const PHASEN_AUSSERHALB: Record<string, string> = {
  finanzierungsvorschlag: "Finanzierungsvorschlag beim Kunden",
  kreditpruefung_eingereicht: "Bei der Bank in Prüfung",
  zusage: "Zusage liegt vor",
  abgeschlossen: "Finanzierung abgeschlossen",
};

/**
 * Führt BaufiDesk diesen Fall noch, oder läuft er außerhalb?
 *
 * Ausdrücklich ausgeführt, damit dieselbe Frage nicht ein viertes Mal
 * beantwortet wird: Die Lead-Karte im Kanban hatte ihre eigene Regel für
 * „Erstgespräch führen" und kannte die Phase nicht – der Knopf stand deshalb
 * weiter auf Karten in „Zusage", obwohl die Leiter längst schwieg.
 */
export function laeuftAusserhalb(leadPhase: string | undefined): boolean {
  return Boolean(leadPhase && PHASEN_AUSSERHALB[leadPhase]);
}

export function computeNextStep(c: NextStepInput): NextStep {
  const schritt = ermittleSchritt(c);
  const wartet = ermittleWartende(c, schritt);
  return wartet.length > 0 ? { ...schritt, wartet } : schritt;
}

/**
 * Verdrängte, aber sofort erledigbare Schritte. Bewusst kurz gehalten: Der
 * Hinweis soll die eine Hauptaufgabe nicht zerreden.
 */
function ermittleWartende(c: NextStepInput, schritt: NextStep): Array<{ label: string; href: string }> {
  const wartet: Array<{ label: string; href: string }> = [];
  // Während des KI-Laufs ist "freigabebereit" nur ein Zwischenstand – die
  // Dokumente tauchen gleich wieder auf, ein Hinweis wäre irreführend. Bei
  // einem erledigten Fall ist ohnehin nichts mehr zu tun; dort wäre eine
  // offene Freigabe ein Hinweis auf Arbeit, die niemand mehr braucht.
  const stumm =
    schritt.key === "ki_laeuft" ||
    schritt.key === "erledigt" ||
    // Fuehrt BaufiDesk den Fall nicht mehr (Phase ab "Finanzierungsvorschlag"),
    // gilt das auch fuer die Nebenaufgaben. Der erste Anlauf am 16.08.2026
    // stellte nur die Hauptsprosse still – "Wartet ausserdem" sagte weiter
    // "Erstgespraech fuehren", waehrend die Karte darueber "Zusage liegt vor"
    // meldete. Wer die Fuehrung abgibt, gibt sie ganz ab.
    schritt.key === "vertrieb_laeuft";
  if (!stumm && schritt.key !== "dokumente_freigeben" && c.counts.pruefbereit > 0) {
    wartet.push({
      label: `${c.counts.pruefbereit} Dokument${c.counts.pruefbereit === 1 ? "" : "e"} prüfen & freigeben`,
      href: `/review?case=${c.caseId}`,
    });
  }
  // Das Erstgespraech braucht weder einen versendeten Erstkontakt noch eine
  // fertige KI-Pruefung als Voraussetzung – es laesst sich jederzeit parallel
  // fuehren. Verdraengt ein hoeherer Schritt (Dokumentfreigabe, kritische
  // Hinweise, Erstkontakt, KI-Lauf/-Fehler) die Stufe "erstgespraech" von
  // vorn, bleibt sie trotzdem sofort erledigbar und soll nicht spurlos
  // verschwinden (derselbe Grund wie bei der Dokumentfreigabe oben, siehe
  // Fall UP-2026-0007). Dieselbe Sperre wie oben: fuer abgegebene Faelle
  // (schreibgeschuetzte Maske) und bei einer Bank-Nachforderung waere der
  // Hinweis kein erledigbarer Wegweiser, sondern eine Sackgasse.
  //
  // Der `gefuehrtAm`-Waechter ist Juergens Entscheidung vom 17.08.2026 (Fall
  // UP-2026-0019): "Ich habe das Erstgespraech abgehakt – es steht aber immer
  // noch als ToDo im Fall." Vorher fehlte er hier bewusst, damit die offenen
  // Angaben auffindbar bleiben – nur machte das den Haken wirkungslos: Die
  // Sprosse trat zurueck, und derselbe Satz stand eine Zeile tiefer wieder da.
  // Auffindbar bleibt die Maske ueber den Dauer-Einstieg in der
  // Werkzeugspalte der Fallseite ("Erstgespräch führen · N offen",
  // cases/[id]/page.tsx), der genau dafuer unabhaengig von der Fallreise
  // gebaut ist. Ein Werkzeug ist kein ToDo; nur die Fallreise mahnt.
  //
  // Damit haengen jetzt DREI Stellen an demselben Haken – die Sprosse
  // (`erstgespraechSchritt`), die Kontaktstrecke (`kontaktstreckeLaeuft`) und
  // dieser Hinweis. Jede weitere Stelle, die das Erstgespraech anmahnt, MUSS
  // ihn ebenfalls lesen, sonst widerspricht sich der Fall wieder selbst.
  if (
    !stumm &&
    schritt.key !== "erstgespraech" &&
    c.erstgespraech &&
    !c.erstgespraech.gefuehrtAm &&
    c.erstgespraech.offeneAngaben > 0 &&
    !LOCKED_CASE_STATUSES.has(c.status as CaseStatus) &&
    c.status !== "bank_nachforderung"
  ) {
    wartet.push({
      label: "Erstgespräch führen",
      href: `/cases/${c.caseId}/erstgespraech`,
    });
  }
  /*
   * Die Gegenrichtung, seit das Erstgespraech beim frischen Lead vorn steht
   * (14.08.2026): Jetzt ist es der fertige Erstkontakt-Entwurf, der verdraengt
   * wird – und der ist genauso sofort erledigbar. Ohne diesen Hinweis
   * verschwaende er spurlos, bis das Gespraech abgehakt ist; das ist dieselbe
   * Falle, an der im Juli die Dokumentfreigabe unauffindbar war.
   *
   * Nur der VORBEREITETE Entwurf: Ist noch keiner erzeugt, gaebe es nichts zu
   * pruefen, und der Hinweis fuehrte in eine Sackgasse.
   */
  if (
    !stumm &&
    schritt.key !== "erstkontakt_entwurf" &&
    c.erstkontakt &&
    !c.erstkontakt.versendet &&
    c.erstkontakt.vorbereitet &&
    c.erstkontakt.empfaenger
  ) {
    wartet.push({
      label: "Erstkontakt prüfen & senden",
      href: `/cases/${c.caseId}/messages`,
    });
  }
  /*
   * Der Abbruchvorschlag: `abbruchFaellig` ist monoton (einmal wahr, nie
   * wieder falsch). Als Hauptschritt haette er die Leiter fuer einen Kunden,
   * der telefonisch nie erreichbar war, aber schriftlich mitarbeitet
   * (Mail-Antwort, Upload, Selbstauskunft), fuer immer auf "aufgeben?"
   * festgehalten – Machbarkeit, Luecken, Fristen und Einreichung waeren dann
   * unerreichbar. Deshalb nur ein Hinweis, kein Blocker – und zwar hinter
   * GENAU demselben Waechter wie die Sprosse selbst (`kontaktstreckeLaeuft`).
   * Solange das eine Kopie war, lief es prompt auseinander: Der Hauptschritt
   * trat beim gefuehrten Erstgespraech zurueck, der Vorschlag mahnte weiter
   * "aufgeben?" – bei einem Fall, dessen Gespraech nachweislich stattfand.
   */
  if (!stumm && kontaktstreckeLaeuft(c) && c.kontakt.stand.abbruchFaellig) {
    /*
     * Ziel ist das BOARD, nicht die Fallseite: "verloren" wird ausschliesslich
     * ueber den `LossDialog` im Lead-Board gesetzt (`setzeVerloren`,
     * pipeline/lead-board.tsx unter /dashboard). Der Hinweis zeigte frueher
     * auf `/cases/<id>` – dort gibt es keinen Weg, den Fall aufzugeben, der
     * Vorschlag hatte also keine Ausfahrt. Der Text nennt deshalb auch, WAS
     * dort zu tun ist.
     */
    wartet.push({
      label: `Kunde seit ${c.kontakt.stand.fristTage} Tagen nicht erreichbar – im Board als verloren markieren?`,
      href: "/dashboard",
    });
  }
  return wartet;
}

/**
 * Laeuft fuer diesen Fall ueberhaupt noch eine telefonische Kontaktstrecke?
 *
 * EINE Regel, ZWEI Leser: die Sprosse `kontaktSchritt` und der
 * Abbruchvorschlag in `ermittleWartende`. Beide standen frueher als eigene
 * Bedingungskette da – und liefen sofort auseinander, als die Regel
 * "gefuehrtes Erstgespraech beweist Kontakt" dazukam: Der Hauptschritt trat
 * zurueck, der Vorschlag mahnte weiter "aufgeben?".
 *
 * Die Waechter im Einzelnen:
 * - kein Kontaktstand geladen (z. B. Bestandsfall vor `KONTAKT_START_AB`, oder
 *   ein Aufrufer, der den Block nicht laedt) → die Leiter verhaelt sich wie
 *   vor der Einfuehrung der Kontaktaufnahme,
 * - `verloren` (KEIN CaseStatus, sondern `verlorenAm` am Fall – die
 *   LOCKED_CASE_STATUSES fangen es deshalb nicht ab),
 * - abgegebene Faelle (Maske schreibgeschuetzt) und `bank_nachforderung`
 *   (nicht gesperrt, aber fachlich vorbei) – dieselben Waechter wie beim
 *   Erstgespraech,
 * - ein als gefuehrt abgehaktes Erstgespraech IST der Beweis, dass Kontakt
 *   bestand, auch ohne einen daneben angeklickten "erreicht"-Vermerk,
 * - und "erreicht" selbst, das die Strecke ohnehin beendet.
 */
function kontaktstreckeLaeuft(
  c: NextStepInput
): c is NextStepInput & { kontakt: NonNullable<NextStepInput["kontakt"]> } {
  if (!c.kontakt) return false;
  if (c.verloren) return false;
  if (LOCKED_CASE_STATUSES.has(c.status as CaseStatus)) return false;
  if (c.status === "bank_nachforderung") return false;
  if (c.erstgespraech?.gefuehrtAm) return false;
  if (c.kontakt.stand.jeErreicht) return false;
  return true;
}

/**
 * Der frische Lead gehoert ans Telefon – und zwar VOR das Erstgespraech: Ohne
 * Kontakt gibt es kein Gespraech, das man fuehren koennte.
 *
 * An dieselben Waechter gebunden wie `erstgespraechSchritt`: Bei abgegebenen
 * Faellen und bei einer Bank-Nachforderung ist die Strecke vorbei.
 *
 * Ist der Abstand noch nicht abgelaufen, gibt die Funktion null zurueck – die
 * Leiter zeigt dann den naechsten Schritt darunter. Anrufen kann man trotzdem
 * jederzeit; die Sprosse mahnt nur, wenn es faellig ist.
 *
 * Liefert bewusst NIE einen "aufgeben"-Hauptschritt: `abbruchFaellig` ist
 * monoton (einmal wahr, nie wieder falsch) – als Hauptschritt haette er einen
 * Kunden, der telefonisch nie erreicht wurde, aber schriftlich mitarbeitet
 * (Mail-Antwort, Upload, Selbstauskunft), fuer immer auf "aufgeben?"
 * festgenagelt und Machbarkeit, Luecken, Fristen und Einreichung unerreichbar
 * gemacht – dieselbe Falle, die bei `erstgespraech` schon einmal zuschnappte.
 * Die Spec nennt den Abbruch ausdruecklich einen VORSCHLAG; er taucht deshalb
 * nur als Hinweis in `wartet` auf (siehe `ermittleWartende`).
 */
function kontaktSchritt(c: NextStepInput): NextStep | null {
  // Die Waechter stehen in `kontaktstreckeLaeuft` – gemeinsam mit dem
  // Abbruchvorschlag, damit beide dieselbe Antwort geben.
  if (!kontaktstreckeLaeuft(c)) return null;

  const { stand, telefon } = c.kontakt;
  // Der Abstand ist KEIN Waechter der Strecke, sondern nur ihre Taktung: Er
  // schweigt bis zum naechsten faelligen Versuch, waehrend der
  // Abbruchvorschlag durchaus weiterlaufen darf.
  if (!stand.faellig) return null;

  const ohneNummer = telefon
    ? ""
    : " Für diesen Fall ist keine Telefonnummer hinterlegt – ohne sie hilft nur der schriftliche Weg.";

  const naechster = stand.versuche + 1;
  return {
    key: "kontakt_aufnehmen",
    title: naechster === 1 ? "Kunden anrufen" : `Kunden anrufen – ${naechster}. Versuch`,
    hervorgehoben: true,
    reason:
      naechster === 1
        ? `Der Lead ist frisch. Im Baufi-Vertrieb entscheidet die Geschwindigkeit des ersten Anrufs.${ohneNummer}`
        : `${stand.versuche} Versuch${stand.versuche === 1 ? "" : "e"} bisher ohne Kontakt.${ohneNummer}`,
    tone: "review",
  };
}

/**
 * Die Erstgespraechs-Stufe – EINE Regel, zwei Einsatzorte.
 *
 * Sie wird zweimal gefragt: einmal ganz vorn, solange der Erstkontakt noch
 * nicht raus ist (der frische Lead, siehe unten), und einmal an ihrem
 * angestammten Platz hinter Dokumentfreigabe und kritischen Hinweisen. Beide
 * Male muessen dieselben Bedingungen gelten, sonst zeigt die Leiter je nach
 * Fallalter einen anderen Schritt fuer denselben Zustand.
 *
 * An `!LOCKED_CASE_STATUSES.has(...)` gebunden: Fuer abgegebene Faelle
 * (exportiert/uebertragen/abgeschlossen/archiviert) ist die Maske
 * schreibgeschuetzt (`feld.tsx`) – der Schritt waere dort nicht erledigbar und
 * die Leiter bliebe fuer immer bei ihm stehen. "bank_nachforderung" faellt
 * NICHT unter LOCKED_CASE_STATUSES (die Maske bleibt dort bearbeitbar) und
 * braucht deshalb einen eigenen Ausschluss: Ein Fall, den die Bank bereits
 * zurueckgemeldet hat, gehoert auf "Fristen im Blick behalten", nicht zurueck
 * ins Erstgespraech.
 *
 * `gefuehrtAm` gesetzt heisst: abgehakt – die Stufe tritt zurueck und
 * schweigt. Seit dem 17.08.2026 gilt das auch fuer den Hinweis in
 * `ermittleWartende`, der den Schritt vorher sofort wieder aufnahm und den
 * Haken damit wirkungslos machte (Begruendung dort). Erreichbar bleibt die
 * Maske ueber den Dauer-Einstieg in der Werkzeugspalte der Fallseite.
 */
function erstgespraechSchritt(c: NextStepInput): NextStep | null {
  if (!c.erstgespraech || c.erstgespraech.offeneAngaben <= 0) return null;
  if (c.erstgespraech.gefuehrtAm) return null;
  if (LOCKED_CASE_STATUSES.has(c.status as CaseStatus)) return null;
  if (c.status === "bank_nachforderung") return null;

  const offen = c.erstgespraech.offeneAngaben;
  return {
    key: "erstgespraech",
    title: "Erstgespräch führen",
    // Juergens Ansage vom 14.08.2026: der Schritt soll "viel prominenter"
    // sein. Seit demselben Tag teilt sich das mit kontakt_aufnehmen – beide
    // sind der Ruf zum Telefon und duerfen gleich laut sein.
    hervorgehoben: true,
    reason: `${offen} Angabe${offen === 1 ? "" : "n"} fehl${offen === 1 ? "t" : "en"} noch für ein Angebot. Die Maske führt dich durch die Fragen.`,
    tone: "review",
    cta: { label: "Erstgespräch öffnen", href: `/cases/${c.caseId}/erstgespraech` },
  };
}

function ermittleSchritt(c: NextStepInput): NextStep {
  const id = c.caseId;

  // Erledigte Faelle zuerst: Die Fallseite berechnet den Schritt fuer JEDEN
  // Fall, auch fuer abgeschlossene – anders als das Dashboard, das terminale
  // Status herausfiltert. Ohne diese Stufe fiel ein archivierter Fall bis ans
  // Ende der Leiter durch und wurde dort aufgefordert, seine Einreichung
  // vorzubereiten. Bewusst ohne Handlungsaufforderung: Hier ist nichts zu tun.
  if (c.status === "abgeschlossen" || c.status === "archiviert") {
    return {
      key: "erledigt",
      title: c.status === "archiviert" ? "Fall archiviert" : "Fall abgeschlossen",
      reason:
        c.status === "archiviert"
          ? "Der Fall liegt im Archiv. Er wird nicht mehr bearbeitet."
          : "Die Finanzierung steht. Für diesen Fall ist nichts mehr zu tun.",
      tone: "ready",
    };
  }

  if (c.status === "ki_pruefung_laeuft" || c.counts.docsLaufend > 0) {
    return {
      key: "ki_laeuft",
      title: "KI-Prüfung läuft",
      reason:
        "Die Dokumente werden gerade gelesen und ausgewertet – bei vielen Dokumenten kann das einige Minuten dauern, weil der KI-Anbieter die Anfragen pro Minute begrenzt.",
      tone: "ai",
    };
  }

  if (c.counts.docsFehler > 0) {
    return {
      key: "ki_fehler",
      title: `${c.counts.docsFehler} Dokument${c.counts.docsFehler === 1 ? "" : "e"} ohne KI-Ergebnis`,
      reason: "Bei der letzten Auswertung ist etwas schiefgelaufen. Ein erneuter Lauf behebt das in der Regel.",
      tone: "review",
    };
  }

  // Eine faellige Wiedervorlage ist eine Verabredung mit Datum – sie schlaegt
  // jeden allgemeinen Anstupser, auch den Erstkontakt. Frueher stand dieser
  // Zweig hinter dem Erstkontakt-Block; der kehrt aber auf JEDEM Pfad per
  // return zurueck, sodass diese Pruefung fuer einen frischen Lead mit
  // unversendetem Erstkontakt ("Kunde bat um Rueckruf naechste Woche") nie
  // erreicht wurde. Deshalb jetzt VOR dem Erstkontakt-Block, direkt nach den
  // KI-Stufen.
  if (c.wiedervorlageFaellig) {
    return {
      key: "wiedervorlage_faellig",
      title: "Wiedervorlage ist fällig",
      reason: "Du hattest dir diesen Fall für heute vorgemerkt.",
      tone: "review",
      /*
       * Controller-Entscheidung (14.08.2026): Diese Sprosse hat kein
       * "erledigt"-Gegenstueck und steht weit vorn in der Leiter. Ein reiner
       * Datumsvergleich wuerde ein altes, nie geraeumtes Datum den Fall
       * dauerhaft hier festhalten und alles darunter verdecken – dieselbe
       * Falle, die bei kontakt_aufgeben schon zuschnappte. Die Sprosse SOLL
       * mahnen, darf aber nicht unentrinnbar sein: Der cta fuehrt deshalb zur
       * Verwaltungsseite, wo das Feld Wiedervorlage liegt und sich
       * verschieben oder raeumen laesst – nicht zurueck auf die Fallseite,
       * die diese Karte ja gerade zeigt.
       */
      cta: { label: "Wiedervorlage verwalten", href: `/cases/${id}/verwaltung` },
    };
  }

  // Erstkontakt vor allem Fachlichen: Er ist der Weg, auf dem der Kunde
  // überhaupt erst um die fehlenden Kundendaten und Unterlagen gebeten wird
  // (der Entwurf enthält bereits die Checkliste). Solange er nicht versendet
  // ist, wäre jede andere Anweisung ("Kundendaten ergänzen", "Unterlagen
  // anfordern") vorschnell – der eigentliche erste Schritt fehlt noch.
  /*
   * Ab „Finanzierungsvorschlag" führt BaufiDesk den Fall nicht mehr: Ab da
   * läuft die Arbeit in Europace, Unterlagen kommen per Mail und werden dort
   * gepflegt (Jürgen, 15.08.2026).
   *
   * Die Leiter mahnte solche Fälle weiter an, weil sie nur den FALLSTATUS las
   * und die LEADPHASE gar nicht kannte – und „Zusage" ist die eine Phase, die
   * ausschließlich der Vermittler selbst setzt.
   *
   * Bewusst NICHT stillgestellt und deshalb VOR dieser Wache: die
   * Abschlussmeldung, laufende KI-Prüfung und KI-Fehler sowie die fällige
   * Wiedervorlage. Die Nachforderung der Bank steht weiter unten und wird hier
   * ausdrücklich durchgelassen – sie kommt von außen und ist genau dann
   * wichtig, wenn der Fall bei der Bank liegt.
   */
  const ausserhalb = c.leadPhase ? PHASEN_AUSSERHALB[c.leadPhase] : undefined;
  if (ausserhalb && laeuftAusserhalb(c.leadPhase) && c.status !== "bank_nachforderung") {
    return {
      key: "vertrieb_laeuft",
      title: ausserhalb,
      reason:
        "Dieser Fall wird außerhalb geführt – BaufiDesk mahnt hier nichts mehr an. " +
        "Zieh die Phase im Kanban zurück, wenn du die Führung wieder brauchst.",
      tone: "neutral",
    };
  }

  if (c.erstkontakt && !c.erstkontakt.versendet) {
    if (!c.erstkontakt.empfaenger) {
      return {
        key: "erstkontakt_email_fehlt",
        title: "E-Mail-Adresse für den Erstkontakt fehlt",
        reason:
          "Für diesen Fall ist noch keine E-Mail-Adresse hinterlegt – ohne sie kann weder der Erstkontakt noch eine spätere Nachforderung raus.",
        tone: "blocker",
        cta: { label: "Kundendaten ergänzen", href: `/cases/${id}/edit` },
      };
    }
    /*
     * Der frische Lead gehoert ans Telefon, nicht ins Postfach.
     *
     * Juergens Ansage vom 14.08.2026: "Erstgespraech ist die 1. Aufgabe nach
     * Leadeingang." Vorher gewann hier der Erstkontakt – der Lead bekam also
     * eine Mail mit Unterlagen-Checkliste, bevor ihn ueberhaupt jemand
     * angerufen hatte. Im Baufi-Vertrieb entscheidet die Geschwindigkeit des
     * ersten Anrufs; die Mail kuendigt man im Gespraech an.
     *
     * Nur solange der Erstkontakt NICHT versendet ist: Danach gilt wieder die
     * angestammte Ordnung, damit ein Fall mit wartenden Dokumenten nicht vom
     * Gespraech verdeckt wird (dieselbe Falle wie im Juli, siehe
     * `ermittleWartende`). Der Blocker "E-Mail-Adresse fehlt" steht bewusst
     * WEITER davor: Ohne Adresse kaeme spaeter weder Erstkontakt noch
     * Nachforderung raus, und das faellt sonst erst nach dem Gespraech auf.
     */
    const vorDemGespraech = kontaktSchritt(c);
    if (vorDemGespraech) return vorDemGespraech;
    const vorDerMail = erstgespraechSchritt(c);
    if (vorDerMail) return vorDerMail;

    if (!c.erstkontakt.vorbereitet) {
      return {
        key: "erstkontakt_vorbereiten",
        title: "Erstkontakt vorbereiten",
        reason: `Upload-Link, Selbstauskunfts-Link und eine fertige Nachricht an ${c.erstkontakt.empfaenger} sind noch nicht erzeugt – verschickt wird dabei noch nichts.`,
        tone: "review",
      };
    }
    return {
      key: "erstkontakt_entwurf",
      title: "Erstkontakt prüfen & senden",
      reason: `Der Entwurf ist fertig formuliert und wartet auf deine Prüfung, bevor er an ${c.erstkontakt.empfaenger} geht.`,
      tone: "review",
      cta: { label: "Prüfen und senden", href: `/cases/${id}/messages` },
    };
  }

  // Vor der Dokumentfreigabe: Aus der Selbstauskunft entstehen die Stammdaten,
  // auf denen Haushaltsrechnung und Einreichung aufbauen.
  if (c.selbstauskunft?.eingegangen) {
    return {
      key: "selbstauskunft_eingegangen",
      title: "Selbstauskunft prüfen & übernehmen",
      reason:
        "Der Kunde hat seine Angaben geschickt. Nach deiner Freigabe stehen sie in der Fallakte.",
      tone: "review",
      cta: { label: "Angaben ansehen", href: `/cases/${id}#selbstauskunft-eingang` },
    };
  }

  if (c.counts.pruefbereit > 0) {
    return {
      key: "dokumente_freigeben",
      title: `${c.counts.pruefbereit} Dokument${c.counts.pruefbereit === 1 ? "" : "e"} prüfen & freigeben`,
      reason: "Die KI hat die Daten erkannt. Nach deiner Freigabe wandern sie in die Fallakte.",
      tone: "ai",
      cta: { label: "Jetzt prüfen", href: `/review?case=${id}` },
    };
  }

  if (c.missingCustomerFields.length > 0) {
    return {
      key: "kundendaten",
      title: "Kundendaten vervollständigen",
      reason: `${c.missingCustomerFields.length} Pflichtangabe${c.missingCustomerFields.length === 1 ? "" : "n"} fehl${c.missingCustomerFields.length === 1 ? "t" : "en"}: ${c.missingCustomerFields.join(", ")}.`,
      tone: "blocker",
      cta: { label: "Kundendaten ergänzen", href: `/cases/${id}/edit` },
    };
  }

  if (c.counts.criticals > 0) {
    return {
      key: "kritische_hinweise",
      title: `${c.counts.criticals} kritische${c.counts.criticals === 1 ? "r" : ""} Hinweis${c.counts.criticals === 1 ? "" : "e"} klären`,
      reason: "Die Plausibilitätsprüfung hat Widersprüche gefunden, die vor der Einreichung geklärt werden müssen.",
      tone: "blocker",
      cta: { label: "Hinweise ansehen", href: `/cases/${id}?tab=plausibilitaet` },
    };
  }

  // Nach der Dokumentfreigabe und den kritischen Hinweisen: liegen die vor,
  // ist der Fall ueber das Erstgespraech hinaus – sie sind dringlicher (siehe
  // die beiden Faelle oben). Aber immer noch vor Machbarkeit/Unterlagen-Kram:
  // ohne die Angaben aus dem Gespraech laesst sich kein Angebot rechnen.
  //
  // An `!LOCKED_CASE_STATUSES.has(...)` gebunden: Fuer abgegebene Faelle
  // (exportiert/uebertragen/abgeschlossen/archiviert) ist die Maske
  // schreibgeschuetzt (`feld.tsx`, LOCKED_CASE_STATUSES) – der Schritt waere
  // dort nicht erledigbar und die Leiter bliebe fuer immer bei ihm stehen.
  // "bank_nachforderung" faellt NICHT unter LOCKED_CASE_STATUSES (die Maske
  // bleibt dort bearbeitbar) und braucht deshalb einen eigenen Ausschluss:
  // Ein Fall, den die Bank bereits zurueckgemeldet hat, gehoert auf "Fristen
  // im Blick behalten" (siehe die "fristen"-Stufe unten), nicht zurueck ins
  // Erstgespraech.
  const vorDemGespraech = kontaktSchritt(c);
  if (vorDemGespraech) return vorDemGespraech;
  const nachDerFreigabe = erstgespraechSchritt(c);
  if (nachDerFreigabe) return nachDerFreigabe;

  // Vor allem Unterlagen-Kram: einen Fall, der so nicht darstellbar ist, klärt
  // man, bevor man weiter Unterlagen einsammelt und den Kunden beschäftigt.
  if (c.counts.machbarkeitBlockiert) {
    return {
      key: "machbarkeit",
      title: "Fall ist so nicht darstellbar",
      reason:
        "Beleihungsauslauf oder Haushalt tragen die Finanzierung in dieser Form nicht. Die Machbarkeitsrechnung zeigt, welche Stellschraube das ändern würde.",
      tone: "blocker",
      cta: { label: "Machbarkeit ansehen", href: `/cases/${id}/machbarkeit` },
    };
  }

  // Erst die gefundenen Lücken sichten, dann nachfordern. Andernfalls geht eine
  // Nachforderung raus, der die Hälfte fehlt, und der Kunde wird zweimal
  // angeschrieben – genau der Fehler, den der Detektiv verhindern soll.
  if (c.counts.offeneBefunde > 0) {
    return {
      key: "unterlagen_luecken",
      title: `${c.counts.offeneBefunde} Lücke${c.counts.offeneBefunde === 1 ? "" : "n"} in den Unterlagen gefunden`,
      reason:
        "Die vorliegenden Objektunterlagen nennen Urkunden, die noch nicht in der Akte sind. Sichten und übernehmen, bevor die Nachforderung rausgeht.",
      tone: "review",
      cta: { label: "Lücken ansehen", href: `/cases/${id}?tab=fehlt` },
    };
  }

  if (c.counts.docsMissing > 0) {
    return {
      key: "unterlagen_anfordern",
      title: `${c.counts.docsMissing} Unterlage${c.counts.docsMissing === 1 ? "" : "n"} anfordern`,
      reason: "Für eine vollständige Akte fehlen noch Unterlagen – fordere sie beim Kunden an oder lade sie selbst hoch.",
      tone: "review",
      cta: { label: "Beim Kunden anfordern", href: `/cases/${id}/messages` },
      secondary: [
        { label: "Selbst hochladen", href: `/cases/${id}?tab=dokumente#broker-upload` },
        { label: "Upload-Link erstellen", href: `/cases/${id}#upload-link` },
      ],
    };
  }

  // Weiter unten: nachfassen, wenn der Link liegen bleibt. Wer schon begonnen
  // hat, wird nicht behelligt – er ist ja dran.
  if (
    c.selbstauskunft &&
    !c.selbstauskunft.begonnen &&
    c.selbstauskunft.erstelltVorTagen !== null &&
    c.selbstauskunft.erstelltVorTagen >= 3
  ) {
    return {
      key: "selbstauskunft_wartet",
      title: "Selbstauskunft nachfassen",
      reason: `Der Link liegt seit ${c.selbstauskunft.erstelltVorTagen} Tagen beim Kunden, ohne dass er begonnen hat.`,
      tone: "review",
      cta: { label: "Kunden erinnern", href: `/cases/${id}/messages` },
    };
  }

  // "uebertragen" ist der Status, der "eingereicht" meint – seine Beschriftung
  // lautet woertlich "Bei Bank eingereicht". Hier stand frueher der Wert
  // "eingereicht", den CASE_STATUSES nie kannte: Der Zweig war toter Code, und
  // ein an die Bank uebergebener Fall wurde aufgefordert, seine Einreichung
  // vorzubereiten. "exportiert" zaehlt bewusst NICHT dazu – ein erzeugtes
  // Paket ist noch nicht bei der Bank, dort ist der Einreichungsassistent
  // weiterhin der richtige naechste Schritt.
  if (c.status === "uebertragen" || c.status === "bank_nachforderung") {
    return {
      key: "fristen",
      title: "Fristen & Nachforderungen im Blick behalten",
      reason: "Der Fall ist eingereicht – verfolge Rückmeldungen und Fristen der Bank.",
      tone: "neutral",
      cta: { label: "Verwaltung öffnen", href: `/cases/${id}/verwaltung` },
    };
  }

  return {
    key: "einreichung",
    title: "Einreichung vorbereiten",
    reason: "Akte vollständig, keine offenen Prüfungen – der Fall ist bereit für die Übergabe.",
    tone: "ready",
    cta: { label: "Einreichungsassistent öffnen", href: `/cases/${id}/export` },
  };
}
