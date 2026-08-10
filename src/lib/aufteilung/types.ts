import type { DocumentType } from "@/lib/domain/enums";

/**
 * Ein von der KI vorgeschlagenes Teildokument.
 * Seiten sind 1-basiert, beide Grenzen einschliesslich.
 */
export interface SegmentVorschlag {
  vonSeite: number;
  bisSeite: number;
  vermuteterTyp: DocumentType | null;
  /** Kundentauglicher Kurztitel fuer die Vorschlagsliste. */
  titel: string;
  confidence: number;
}

/**
 * Ab hier lohnt die Pruefung. Ein zweiseitiger Ausweis-Scan enthaelt nie
 * mehrere Dokumente.
 */
export const MIN_SEITEN_FUER_PRUEFUNG = 3;
