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
 *
 * Wer diese Funktion benutzt, MUSS die veralteten Zeilen an anderer Stelle
 * wieder auffangen (countDocumentsWithoutAiResult) – sonst verschwindet ein
 * gestorbener Upload lautlos aus der ganzen Oberfläche.
 */
export function countRunningClassifications(
  docs: Array<{ classificationStatus: string; updatedAt: Date }>,
  now: Date = new Date()
): number {
  return docs.filter((d) => d.classificationStatus === "laeuft" && !isAiCheckStale(d.updatedAt, now)).length;
}

/**
 * Zahl der Dokumente ohne verwertbares KI-Ergebnis – die Grundlage von
 * `counts.docsFehler` (cockpit.ts, dashboard.ts) und damit der Stufe
 * "n Dokumente ohne KI-Ergebnis", die als einzige den Knopf "KI-Prüfung
 * wiederholen" anbietet.
 *
 * Drei Arten davon, und die dritte ist der Grund für diese Funktion:
 *  - Klassifikation auf "fehler",
 *  - Extraktion auf "fehler",
 *  - Klassifikation seit über AI_CHECK_STALE_MS auf "laeuft" HÄNGENGEBLIEBEN.
 *
 * Der dritte Fall entsteht, wenn der Hintergrundlauf hart stirbt (Deploy,
 * Function-Timeout): `pipeline.ts` setzt "fehler" nur bei erreichtem Code, und
 * einen Aufräum-Cron gibt es nicht – die Zeile bleibt für immer auf "laeuft"
 * stehen. Zählte man sie nirgends, fiele sie durch jedes Raster: aus
 * `docsLaufend` (altersbereinigt), aus der Review-Liste (die filtert auf
 * "fertig") und damit aus der Prioritätsleiter. Die Fallseite nennte einen
 * ganz anderen Schritt, das Review-Center meldete "Alles freigegeben" und das
 * Fallbild 100 % – und der Weg zurück (Neustart der KI-Prüfung) wäre nirgends
 * mehr sichtbar. Genau deshalb landet er hier statt im Nichts.
 *
 * Ein Dokument zählt höchstens EINMAL: "fehler" und "laeuft" schließen sich in
 * derselben Spalte aus, aber Klassifikation "laeuft" bei Extraktion "fehler"
 * gibt es – deshalb ein Filter über das Dokument, keine Summe dreier Zählungen.
 */
export function countDocumentsWithoutAiResult(
  docs: Array<{ classificationStatus: string; extractionStatus: string; updatedAt: Date }>,
  now: Date = new Date()
): number {
  return docs.filter(
    (d) =>
      d.classificationStatus === "fehler" ||
      d.extractionStatus === "fehler" ||
      (d.classificationStatus === "laeuft" && isAiCheckStale(d.updatedAt, now))
  ).length;
}
