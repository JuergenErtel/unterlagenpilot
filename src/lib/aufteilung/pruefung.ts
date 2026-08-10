import type { SegmentVorschlag } from "./types";

/**
 * Je Segment, nicht als Mittelwert: sonst zieht ein sehr sicheres Segment zwei
 * unsichere mit durch.
 */
export const MIN_KONFIDENZ = 0.7;

export type Pruefergebnis = { ok: true } | { ok: false; grund: string };

/**
 * Entscheidet, ob aus einer KI-Antwort ueberhaupt ein Vorschlag wird.
 *
 * Bewusst hier und nicht im Prompt: Ein langes Dokument sieht innen oft aus wie
 * viele Dokumente – eine Teilungserklaerung hat Abschnitte mit eigenen
 * Ueberschriften. Im Zweifel lieber kein Vorschlag; ein zerrissenes Dokument
 * kostet mehr Zeit, als das Auftrennen spart.
 */
export function pruefeSegmente(segmente: SegmentVorschlag[], seitenzahl: number): Pruefergebnis {
  if (segmente.length < 2) {
    return { ok: false, grund: "Weniger als zwei Segmente – das ist keine Aufteilung." };
  }

  for (const s of segmente) {
    if (!Number.isInteger(s.vonSeite) || !Number.isInteger(s.bisSeite)) {
      return { ok: false, grund: "Seitenangabe ist keine ganze Zahl." };
    }
    if (s.vonSeite < 1 || s.bisSeite > seitenzahl || s.vonSeite > s.bisSeite) {
      return { ok: false, grund: `Ungültiger Seitenbereich ${s.vonSeite}–${s.bisSeite}.` };
    }
    if (s.confidence < MIN_KONFIDENZ) {
      return {
        ok: false,
        grund: `Segment „${s.titel}" ist zu unsicher (Konfidenz ${s.confidence}).`,
      };
    }
  }

  // Lueckenlos und ueberschneidungsfrei ueber das ganze Dokument.
  const sortiert = [...segmente].sort((a, b) => a.vonSeite - b.vonSeite);
  if (sortiert[0]!.vonSeite !== 1) {
    return { ok: false, grund: "Die Segmente beginnen nicht auf Seite 1 – es bliebe eine Lücke." };
  }
  if (sortiert[sortiert.length - 1]!.bisSeite !== seitenzahl) {
    return {
      ok: false,
      grund: "Die Segmente enden nicht auf der letzten Seite – es bliebe eine Lücke.",
    };
  }
  for (let i = 1; i < sortiert.length; i++) {
    if (sortiert[i]!.vonSeite !== sortiert[i - 1]!.bisSeite + 1) {
      return { ok: false, grund: "Die Segmente überschneiden sich oder lassen eine Lücke." };
    }
  }

  // Nur ein Typ heisst: das ist EIN Dokument mit Abschnitten.
  const typen = new Set(sortiert.map((s) => s.vermuteterTyp ?? "unbekannt"));
  if (typen.size < 2) {
    return {
      ok: false,
      grund: "Alle Segmente haben denselben Typ – das ist ein Dokument, kein Stapel.",
    };
  }

  return { ok: true };
}
