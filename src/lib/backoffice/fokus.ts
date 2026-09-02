import type { BackofficeStatus } from "@/lib/domain/enums";
import type { AuftragFuerKennzahlen } from "./kennzahlen";
import { bewerteSla } from "./sla";
import { istAktiv } from "./status";

/**
 * Die naechste konkrete Handlung an einem Auftrag - als Satz, den der
 * Bearbeiter sofort ausfuehren kann. Rein, damit Dashboard, "Jetzt
 * bearbeiten" und Auftragsseite dasselbe sagen.
 */
export interface Handlung {
  text: string;
  /** Wohin der Klick fuehrt (relativ zum Auftrag oder zur Akte). */
  ziel: "auftrag" | "unterlagen" | "review";
  /** Was gerade blockiert, falls etwas blockiert. */
  blocker: string | null;
  /** Ist es eine Wartelage (nichts zu tun) statt einer Aufgabe? */
  wartet: boolean;
}

export function naechsteHandlung(a: AuftragFuerKennzahlen): Handlung {
  if (a.pausiertSeit) return { text: "Pausiert – fortsetzen, wenn es weitergeht", ziel: "auftrag", blocker: "Pausiert", wartet: true };
  const s = a.status as BackofficeStatus;
  switch (s) {
    case "neu_eingegangen":
      return { text: "Auftrag prüfen und übernehmen", ziel: "auftrag", blocker: null, wartet: false };
    case "auftrag_pruefen":
      return { text: "Aufbereitung beginnen", ziel: "auftrag", blocker: null, wartet: false };
    case "in_aufbereitung":
    case "nachbearbeitung":
      if (a.ungepruefteDokumente > 0) {
        return { text: `${a.ungepruefteDokumente} ${a.ungepruefteDokumente === 1 ? "Dokument" : "Dokumente"} prüfen`, ziel: "unterlagen", blocker: null, wartet: false };
      }
      if (a.beantworteteRueckfragen > 0) {
        return { text: "Rückmeldung des Auftraggebers lesen", ziel: "auftrag", blocker: null, wartet: false };
      }
      if (a.fehlendeUnterlagen > 0) {
        return { text: `${a.fehlendeUnterlagen} fehlende ${a.fehlendeUnterlagen === 1 ? "Unterlage" : "Unterlagen"} anfordern`, ziel: "unterlagen", blocker: null, wartet: false };
      }
      return { text: s === "nachbearbeitung" ? "Nachbesserung abschließen und erneut zur Qualitätskontrolle" : "Qualitätskontrolle anfordern", ziel: "auftrag", blocker: null, wartet: false };
    case "wartet_auf_unterlagen":
      return a.ungepruefteDokumente > 0
        ? { text: `Eingang prüfen: ${a.ungepruefteDokumente} neue ${a.ungepruefteDokumente === 1 ? "Datei" : "Dateien"}`, ziel: "unterlagen", blocker: null, wartet: false }
        : { text: "Wartet auf Unterlagen des Auftraggebers", ziel: "auftrag", blocker: `${a.fehlendeUnterlagen} fehlende Unterlagen`, wartet: true };
    case "rueckfrage_auftraggeber":
      return a.beantworteteRueckfragen > 0
        ? { text: "Rückmeldung eingegangen – lesen und weiterarbeiten", ziel: "auftrag", blocker: null, wartet: false }
        : { text: "Wartet auf Antwort des Auftraggebers", ziel: "auftrag", blocker: `${a.offeneRueckfragen} offene ${a.offeneRueckfragen === 1 ? "Rückfrage" : "Rückfragen"}`, wartet: true };
    case "qualitaetskontrolle":
      return { text: "Qualitätskontrolle durchführen", ziel: "auftrag", blocker: null, wartet: false };
    case "einreichungsfertig":
      return { text: "An Auftraggeber übergeben", ziel: "auftrag", blocker: null, wartet: false };
    case "uebergeben":
      return { text: "Wartet auf Abnahme durch den Auftraggeber", ziel: "auftrag", blocker: null, wartet: true };
    case "abgeschlossen":
    case "abgelehnt":
    case "storniert":
      return { text: "Abgeschlossen", ziel: "auftrag", blocker: null, wartet: true };
  }
}

/**
 * Der eine Auftrag, der jetzt dran ist: ueberfaellig vor heute vor
 * Prioritaet vor Frist - unter denen, an denen das Backoffice arbeiten
 * kann. Null, wenn nichts wartet.
 */
export function fokusAuftrag<T extends AuftragFuerKennzahlen>(auftraege: T[], jetzt: Date): T | null {
  const PRIO: Record<string, number> = { dringend: 0, hoch: 1, normal: 2, niedrig: 3 };
  const kandidaten = auftraege.filter((a) => istAktiv(a.status) && !a.pausiertSeit && !naechsteHandlung(a).wartet);
  const rang = (a: T) => {
    const z = bewerteSla({ faelligAm: a.faelligAm, status: a.status, pausiert: false, jetzt }).zustand;
    return z === "ueberschritten" ? 0 : z === "heute" ? 1 : z === "gefaehrdet" ? 2 : 3;
  };
  return (
    [...kandidaten].sort((a, b) => {
      const r = rang(a) - rang(b);
      if (r !== 0) return r;
      const p = (PRIO[a.prioritaet] ?? 2) - (PRIO[b.prioritaet] ?? 2);
      if (p !== 0) return p;
      return (a.faelligAm?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.faelligAm?.getTime() ?? Number.MAX_SAFE_INTEGER);
    })[0] ?? null
  );
}
