import { AI_CHECK_STALE_MS } from "@/lib/cases/ai-check-status";

interface ProcessingStatusFields {
  ocrStatus: string;
  classificationStatus: string;
  extractionStatus: string;
  updatedAt: Date;
}

/**
 * Zahl der Dokumente, deren Hintergrundverarbeitung (OCR/Klassifikation/
 * Extraktion nach dem Upload) noch läuft. Veraltete `laeuft`-Status zählen
 * nicht mit: Stirbt der Hintergrundlauf hart (Deploy, Function-Timeout),
 * würde die Fallseite sonst endlos weiterpollen.
 */
export function countProcessingDocuments(docs: ProcessingStatusFields[], now: Date = new Date()): number {
  return docs.filter(
    (d) =>
      (d.ocrStatus === "laeuft" || d.classificationStatus === "laeuft" || d.extractionStatus === "laeuft") &&
      now.getTime() - d.updatedAt.getTime() <= AI_CHECK_STALE_MS
  ).length;
}
