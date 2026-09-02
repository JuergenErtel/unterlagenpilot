import type { BackofficeRolle, BackofficeStatus } from "@/lib/domain/enums";
import { BACKOFFICE_TERMINAL_STATUS } from "@/lib/domain/enums";

/**
 * Das Statusmodell eines Backoffice-Auftrags als reine Tabelle.
 *
 * Warum eine Tabelle und kein Code je Uebergang: Die Frage "darf dieser
 * Nutzer diesen Auftrag von A nach B schieben" muss an drei Stellen dieselbe
 * Antwort geben - im Knopf der Oberflaeche, in der Server Action und im Test.
 * Eine Tabelle laesst sich an allen drei Stellen lesen, Code nur ausfuehren.
 *
 * Pausiert ist KEIN Status: Ein pausierter Auftrag steht in dem Status, in
 * dem er pausiert wurde, und traegt nur `pausiertSeit`. Sonst muesste die
 * Pause wissen, wohin sie zurueckkehrt, und die Queue muesste zwei Werte
 * lesen, um einen zu zeigen.
 */

export interface Uebergang {
  von: BackofficeStatus;
  nach: BackofficeStatus;
  /** Welche Backoffice-Rollen den Uebergang ausloesen duerfen. */
  rollen: readonly BackofficeRolle[];
  /** Bezeichnung des Knopfs. */
  label: string;
  /** Verlangt eine Begruendung (QC-Rueckgabe, Ablehnung, Storno). */
  begruendungPflicht?: boolean;
}

const ALLE: readonly BackofficeRolle[] = ["manager", "bearbeiter", "pruefer"];
const MANAGER: readonly BackofficeRolle[] = ["manager"];
const BEARBEITEND: readonly BackofficeRolle[] = ["manager", "bearbeiter"];
const PRUEFEND: readonly BackofficeRolle[] = ["manager", "pruefer"];

export const UEBERGAENGE: readonly Uebergang[] = [
  // Eingang
  { von: "neu_eingegangen", nach: "auftrag_pruefen", rollen: BEARBEITEND, label: "Auftrag prüfen" },
  { von: "neu_eingegangen", nach: "abgelehnt", rollen: MANAGER, label: "Ablehnen", begruendungPflicht: true },
  { von: "neu_eingegangen", nach: "storniert", rollen: MANAGER, label: "Stornieren", begruendungPflicht: true },

  // Pruefung
  { von: "auftrag_pruefen", nach: "in_aufbereitung", rollen: BEARBEITEND, label: "Aufbereitung beginnen" },
  { von: "auftrag_pruefen", nach: "wartet_auf_unterlagen", rollen: BEARBEITEND, label: "Unterlagen anfordern" },
  { von: "auftrag_pruefen", nach: "rueckfrage_auftraggeber", rollen: BEARBEITEND, label: "Rückfrage stellen" },
  { von: "auftrag_pruefen", nach: "abgelehnt", rollen: MANAGER, label: "Ablehnen", begruendungPflicht: true },
  { von: "auftrag_pruefen", nach: "storniert", rollen: MANAGER, label: "Stornieren", begruendungPflicht: true },

  // Wartezustaende - beide fuehren zurueck in die Aufbereitung
  { von: "wartet_auf_unterlagen", nach: "in_aufbereitung", rollen: BEARBEITEND, label: "Unterlagen eingegangen" },
  { von: "wartet_auf_unterlagen", nach: "rueckfrage_auftraggeber", rollen: BEARBEITEND, label: "Rückfrage stellen" },
  { von: "wartet_auf_unterlagen", nach: "storniert", rollen: MANAGER, label: "Stornieren", begruendungPflicht: true },
  { von: "rueckfrage_auftraggeber", nach: "in_aufbereitung", rollen: BEARBEITEND, label: "Rückmeldung eingegangen" },
  { von: "rueckfrage_auftraggeber", nach: "wartet_auf_unterlagen", rollen: BEARBEITEND, label: "Unterlagen anfordern" },
  { von: "rueckfrage_auftraggeber", nach: "storniert", rollen: MANAGER, label: "Stornieren", begruendungPflicht: true },

  // Aufbereitung
  { von: "in_aufbereitung", nach: "wartet_auf_unterlagen", rollen: BEARBEITEND, label: "Unterlagen anfordern" },
  { von: "in_aufbereitung", nach: "rueckfrage_auftraggeber", rollen: BEARBEITEND, label: "Rückfrage stellen" },
  { von: "in_aufbereitung", nach: "qualitaetskontrolle", rollen: BEARBEITEND, label: "Qualitätskontrolle anfordern" },
  { von: "in_aufbereitung", nach: "storniert", rollen: MANAGER, label: "Stornieren", begruendungPflicht: true },

  // Qualitaetskontrolle - Freigabe und Rueckgabe laufen ueber eigene Actions
  // (qualitaetFreigeben / zurNachbearbeitung), stehen aber hier, damit die
  // Tabelle vollstaendig ist und die Rollen an einer Stelle liegen.
  { von: "qualitaetskontrolle", nach: "einreichungsfertig", rollen: PRUEFEND, label: "Freigeben" },
  { von: "qualitaetskontrolle", nach: "nachbearbeitung", rollen: PRUEFEND, label: "Zur Nachbearbeitung zurückgeben", begruendungPflicht: true },
  { von: "qualitaetskontrolle", nach: "storniert", rollen: MANAGER, label: "Stornieren", begruendungPflicht: true },

  // Nachbearbeitung
  { von: "nachbearbeitung", nach: "in_aufbereitung", rollen: BEARBEITEND, label: "Nachbearbeitung beginnen" },
  { von: "nachbearbeitung", nach: "qualitaetskontrolle", rollen: BEARBEITEND, label: "Erneut zur Qualitätskontrolle" },
  { von: "nachbearbeitung", nach: "storniert", rollen: MANAGER, label: "Stornieren", begruendungPflicht: true },

  // Uebergabe - nur aus einreichungsfertig, und das erreicht nur die Freigabe.
  { von: "einreichungsfertig", nach: "uebergeben", rollen: BEARBEITEND, label: "An Auftraggeber übergeben" },
  { von: "einreichungsfertig", nach: "nachbearbeitung", rollen: PRUEFEND, label: "Freigabe zurückziehen", begruendungPflicht: true },

  // Nach der Uebergabe
  { von: "uebergeben", nach: "abgeschlossen", rollen: MANAGER, label: "Abschließen" },
  { von: "uebergeben", nach: "nachbearbeitung", rollen: BEARBEITEND, label: "Nachbearbeitung aufnehmen", begruendungPflicht: true },
];

/** Alle Uebergaenge, die aus einem Status heraus moeglich sind. */
export function moeglicheUebergaenge(von: BackofficeStatus): Uebergang[] {
  return UEBERGAENGE.filter((u) => u.von === von);
}

/** Der Uebergang von -> nach, oder null, wenn er nicht existiert. */
export function findeUebergang(von: BackofficeStatus, nach: BackofficeStatus): Uebergang | null {
  return UEBERGAENGE.find((u) => u.von === von && u.nach === nach) ?? null;
}

export type UebergangsPruefung =
  | { erlaubt: true; uebergang: Uebergang }
  | { erlaubt: false; grund: string };

/**
 * Darf dieser Nutzer diesen Auftrag von `von` nach `nach` schieben?
 *
 * Ein Bearbeiter darf nur an Auftraegen arbeiten, die ihm zugewiesen sind
 * oder die niemandem gehoeren (Uebernahme). Manager und Pruefer sind an
 * keine Zuweisung gebunden. Ein pausierter Auftrag laesst sich nicht
 * schieben - erst fortsetzen.
 */
export function pruefeUebergang(input: {
  von: BackofficeStatus;
  nach: BackofficeStatus;
  rolle: BackofficeRolle | null;
  userId: string;
  bearbeiterId: string | null;
  pausiert: boolean;
  begruendung?: string | null;
}): UebergangsPruefung {
  if (!input.rolle) return { erlaubt: false, grund: "Keine Backoffice-Rolle." };
  if (BACKOFFICE_TERMINAL_STATUS.has(input.von)) {
    return { erlaubt: false, grund: "Der Auftrag ist abgeschlossen." };
  }
  if (input.pausiert) return { erlaubt: false, grund: "Der Auftrag ist pausiert. Erst fortsetzen." };
  const u = findeUebergang(input.von, input.nach);
  if (!u) return { erlaubt: false, grund: "Dieser Statuswechsel ist nicht vorgesehen." };
  if (!u.rollen.includes(input.rolle)) return { erlaubt: false, grund: "Dafür fehlt die Berechtigung." };
  if (
    input.rolle === "bearbeiter" &&
    input.bearbeiterId != null &&
    input.bearbeiterId !== input.userId
  ) {
    return { erlaubt: false, grund: "Der Auftrag ist einer anderen Person zugewiesen." };
  }
  if (u.begruendungPflicht && !(input.begruendung ?? "").trim()) {
    return { erlaubt: false, grund: "Bitte eine Begründung angeben." };
  }
  return { erlaubt: true, uebergang: u };
}

/** Darf diese Rolle eine Qualitaetsfreigabe erteilen oder zurueckgeben? */
export function darfQualitaetPruefen(rolle: BackofficeRolle | null): boolean {
  return rolle === "manager" || rolle === "pruefer";
}

/** Darf diese Rolle Auftraege zuweisen, Prioritaeten und Fristen aendern? */
export function darfVerwalten(rolle: BackofficeRolle | null): boolean {
  return rolle === "manager";
}

/**
 * Ist in diesem Status Arbeit im Backoffice moeglich? Wartezustaende zaehlen
 * dazu - dort wird Eingang verbucht -, terminale Status nicht.
 */
export function istAktiv(status: BackofficeStatus): boolean {
  return !BACKOFFICE_TERMINAL_STATUS.has(status);
}

/** Wartet der Auftrag auf eine Mitwirkung von aussen? */
export function wartetAufAuftraggeber(status: BackofficeStatus): boolean {
  return status === "wartet_auf_unterlagen" || status === "rueckfrage_auftraggeber";
}

/** Bei diesen Status hat das Backoffice die Frist "in der Hand". */
export function fristLaeuft(status: BackofficeStatus): boolean {
  return istAktiv(status) && status !== "uebergeben" && !wartetAufAuftraggeber(status);
}

/** Reihenfolge der Hauptstatus fuer Fortschrittsanzeigen (Portal und Auftrag). */
export const STATUS_STATIONEN: readonly BackofficeStatus[] = [
  "neu_eingegangen",
  "auftrag_pruefen",
  "in_aufbereitung",
  "qualitaetskontrolle",
  "einreichungsfertig",
  "uebergeben",
  "abgeschlossen",
];

/**
 * Wie weit der Auftrag auf der Stationenleiste ist. Wartezustaende und
 * Nachbearbeitung liegen auf der Station "in_aufbereitung", weil sie
 * fachlich dorthin gehoeren - die Leiste zeigt den Weg, nicht den Umweg.
 */
export function stationIndex(status: BackofficeStatus): number {
  const abbildung: Partial<Record<BackofficeStatus, BackofficeStatus>> = {
    wartet_auf_unterlagen: "in_aufbereitung",
    rueckfrage_auftraggeber: "in_aufbereitung",
    nachbearbeitung: "in_aufbereitung",
  };
  const ziel = abbildung[status] ?? status;
  const i = STATUS_STATIONEN.indexOf(ziel);
  return i < 0 ? -1 : i;
}
