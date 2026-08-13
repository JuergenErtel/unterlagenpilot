import { describe, it, expect } from "vitest";
import { countProcessingDocuments, countRunningClassifications } from "@/lib/documents/processing";

const now = new Date("2026-08-03T12:00:00Z");
const fresh = new Date("2026-08-03T11:58:00Z"); // 2 min alt
const stale = new Date("2026-08-03T11:40:00Z"); // 20 min alt

function doc(overrides: Partial<{ ocrStatus: string; classificationStatus: string; extractionStatus: string; updatedAt: Date }>) {
  return {
    ocrStatus: "fertig",
    classificationStatus: "fertig",
    extractionStatus: "fertig",
    updatedAt: fresh,
    ...overrides,
  };
}

describe("countProcessingDocuments", () => {
  it("zählt Dokumente, bei denen OCR, Klassifikation oder Extraktion noch läuft", () => {
    const docs = [
      doc({ ocrStatus: "laeuft" }),
      doc({ classificationStatus: "laeuft" }),
      doc({ extractionStatus: "laeuft" }),
      doc({}),
    ];
    expect(countProcessingDocuments(docs, now)).toBe(3);
  });

  it("ignoriert veraltete laeuft-Status (abgestürzter Hintergrundlauf, kein Endlos-Polling)", () => {
    const docs = [doc({ classificationStatus: "laeuft", updatedAt: stale })];
    expect(countProcessingDocuments(docs, now)).toBe(0);
  });

  it("liefert 0 ohne laufende Verarbeitung", () => {
    expect(countProcessingDocuments([doc({})], now)).toBe(0);
  });
});

/**
 * Grundlage von `counts.docsLaufend` (cockpit.ts, dashboard.ts) und damit der
 * Stufe "KI-Auswertung läuft". Beim normalen Upload ist das Dokument der
 * EINZIGE Ort, an dem der Laufzustand steht – der Fallstatus bleibt unberührt.
 */
describe("countRunningClassifications", () => {
  it("zählt nur Dokumente, deren Klassifikation läuft – nicht OCR oder Extraktion", () => {
    const docs = [
      doc({ classificationStatus: "laeuft" }),
      doc({ ocrStatus: "laeuft" }),
      doc({ extractionStatus: "laeuft" }),
    ];
    expect(countRunningClassifications(docs, now)).toBe(1);
  });

  it("ignoriert veraltete laeuft-Status – daran hängt die Erkennung eines gestorbenen Einzel-Uploads", () => {
    expect(countRunningClassifications([doc({ classificationStatus: "laeuft", updatedAt: stale })], now)).toBe(0);
  });
});
