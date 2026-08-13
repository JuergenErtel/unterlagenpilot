import { isAiCheckStale } from "@/lib/cases/ai-check-status";

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
      !isAiCheckStale(d.updatedAt, now)
  ).length;
}

/**
 * Zahl der Dokumente, deren KI-Klassifikation GERADE läuft – die Grundlage von
 * `counts.docsLaufend` (cockpit.ts, dashboard.ts) und damit der Stufe
 * "KI-Auswertung läuft" der Prioritätsleiter.
 *
 * Wie oben zählen veraltete `laeuft`-Zeilen nicht mit, und zwar aus demselben
 * Grund an anderer Stelle: Der Fallstatus `ki_pruefung_laeuft` ist NUR beim
 * manuellen Sammel-Lauf gesetzt. Beim normalen Upload trägt allein das
 * Dokument den Laufzustand – sein `updatedAt` ist dort der einzige Anhalt
 * dafür, ob der Lauf noch lebt. Ohne diese Bereinigung stünde ein Fall mit
 * einem hart gestorbenen Einzel-Upload für immer auf "KI-Auswertung läuft".
 */
export function countRunningClassifications(
  docs: Array<{ classificationStatus: string; updatedAt: Date }>,
  now: Date = new Date()
): number {
  return docs.filter((d) => d.classificationStatus === "laeuft" && !isAiCheckStale(d.updatedAt, now)).length;
}
