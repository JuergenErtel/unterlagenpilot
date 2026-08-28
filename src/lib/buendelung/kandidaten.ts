import type { DocumentType } from "@/lib/domain/enums";
import { MIN_KANDIDATEN } from "./types";

/**
 * Ein Dokument, so wie die Buendelung es sieht. Bewusst als schlichte Struktur
 * und nicht als Prisma-Typ: die Auswahlregeln sollen ohne Datenbank pruefbar
 * sein, denn sie sind die Stelle, an der falsches Gruen entsteht.
 */
export interface Kandidat {
  id: string;
  originalName: string;
  mimeType: string;
  pageCount: number | null;
  reviewStatus: string;
  ocrStatus: string;
  readable: boolean | null;
  zusammengefuegtInId: string | null;
  documentType: DocumentType | null;
  period: string | null;
  createdAt: Date;
  /** Anfang des OCR-Textes, bereits gekuerzt. */
  text: string;
}

/** Ist das ueberhaupt eine EINZELNE Seite? */
function istEinzelseite(d: Kandidat): boolean {
  if (d.mimeType.startsWith("image/")) return true;
  // Ein mehrseitiges PDF ist bereits ein Dokument. Es zu buendeln hiesse, ein
  // Dokument in ein anderes zu schieben - dafuer gibt es die Aufteilung, nicht
  // dies hier.
  return d.mimeType === "application/pdf" && d.pageCount === 1;
}

/**
 * Darf diese Seite gebuendelt werden?
 *
 * Bewusst einzeln exportiert: die Fallakte braucht dieselbe Frage, um die
 * Auswahlkaestchen zu setzen. Zwei Wahrheiten darueber, was eine Einzelseite
 * ist, waeren genau die Falle, die in diesem Projekt schon zugeschlagen hat.
 */
export function istBuendelKandidat(d: Kandidat): boolean {
  return (
    istEinzelseite(d) &&
    // Eine Freigabe ist eine Entscheidung des Vermittlers; buendeln wuerde sie
    // stillschweigend zuruecknehmen.
    d.reviewStatus === "offen" &&
    d.zusammengefuegtInId === null &&
    d.ocrStatus === "fertig" &&
    // Ohne erkannten Text kann die KI nichts einordnen. Die Seite bleibt
    // liegen und traegt weiter ihr Abzeichen "Kein lesbarer Text".
    d.readable !== false
  );
}

/**
 * Welche Dokumente eines Falls in den Buendel-Lauf gehen.
 *
 * Rein und ohne Datenbank, damit jede einzelne Regel pruefbar bleibt. Unter
 * `MIN_KANDIDATEN` gibt es nichts zu tun - dann ist die Rueckgabe leer und der
 * Aufrufer spart sich den KI-Aufruf.
 */
export function waehleKandidaten(docs: Kandidat[]): Kandidat[] {
  const treffer = docs.filter(istBuendelKandidat);
  if (treffer.length < MIN_KANDIDATEN) return [];
  return treffer.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
