import type { DocumentType } from "@/lib/domain/enums";
import type { FindingCode, Resolution, SeitenText } from "./types";

export interface CompletenessFinding {
  code: FindingCode;
  title: string;
  reason: string;
  resolution: Resolution;
  refKey: string;
}

/** "Seite 12 von 37", "Seite 12/37", "Blatt 3/12" */
const SEITEN_MUSTER = [
  /seite\s+\d{1,3}\s*(?:von|\/)\s*(\d{1,3})/gi,
  /blatt\s+\d{1,3}\s*\/\s*(\d{1,3})/gi,
];

/**
 * Verspricht das Dokument mehr Seiten, als hochgeladen wurden? Der haeufigste
 * stille Fehler beim Kunden-Upload: der Scanner haelt nach der Haelfte an.
 */
export function seitenBefund(
  pages: SeitenText[],
  pageCount: number | null
): CompletenessFinding | null {
  if (pageCount == null) return null;
  let versprochen = 0;
  for (const p of pages) {
    if (!p.text) continue;
    for (const muster of SEITEN_MUSTER) {
      muster.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = muster.exec(p.text)) !== null) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > versprochen) versprochen = n;
      }
    }
  }
  if (versprochen <= pageCount) return null;
  return {
    code: "seiten_unvollstaendig",
    title: `Dokument unvollständig – ${pageCount} von ${versprochen} Seiten vorhanden`,
    reason: `Im Text steht eine Gesamtseitenzahl von ${versprochen}, hochgeladen wurden ${pageCount} Seiten.`,
    resolution: "dokument_nachfordern",
    refKey: `seiten:${versprochen}`,
  };
}

/**
 * Hoechstalter je Dokumenttyp in Monaten. Startwerte; spaeter je Organisation
 * konfigurierbar. Nur Typen, bei denen Banken tatsaechlich auf Aktualitaet
 * bestehen – eine Teilungserklaerung von 1998 ist nie "veraltet".
 */
export const MAX_ALTER_MONATE: Partial<Record<DocumentType, number>> = {
  grundbuchauszug: 6,
};

export function aktualitaetsBefund(
  documentType: DocumentType | null,
  dokumentDatum: Date | null,
  jetzt: Date
): CompletenessFinding | null {
  if (!documentType || !dokumentDatum) return null;
  const grenze = MAX_ALTER_MONATE[documentType];
  if (!grenze) return null;

  const monate =
    (jetzt.getFullYear() - dokumentDatum.getFullYear()) * 12 +
    (jetzt.getMonth() - dokumentDatum.getMonth());
  if (monate < grenze) return null;

  return {
    code: "dokument_veraltet",
    title: `Dokument ist älter als ${grenze} Monate – aktuelle Fassung nötig`,
    reason: `Ausgestellt vor rund ${monate} Monaten. Banken verlangen bei diesem Dokumenttyp in der Regel eine Fassung, die nicht älter als ${grenze} Monate ist.`,
    resolution: "dokument_nachfordern",
    refKey: `alter:${grenze}`,
  };
}
