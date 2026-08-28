import type { DocumentType } from "@/lib/domain/enums";

/**
 * Ein von der KI vorgeschlagenes Buendel. `seiten` sind laufende Nummern in
 * die Kandidatenliste - IN DER GEWUENSCHTEN SEITENREIHENFOLGE. Die Reihenfolge
 * im Array ist die Reihenfolge im spaeteren PDF.
 */
export interface BuendelVorschlag {
  titel: string;
  vermuteterTyp: DocumentType | null;
  confidence: number;
  seiten: number[];
}

/** Unter zwei Seiten gibt es nichts zusammenzufuegen. */
export const MIN_KANDIDATEN = 2;

/** So viel Text bekommt die KI je Seite. Mehr kostet Tokens ohne Mehrwert. */
export const TEXT_ANFANG = 400;
