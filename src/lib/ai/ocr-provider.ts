import type { OCRProvider, OcrInput, OcrResult } from "./types";
import { getEnv } from "@/lib/env";

/**
 * Mock-OCR: erzeugt deterministischen Text. Liest, falls vorhanden, den
 * mitgelieferten Buffer als UTF-8 (z.B. .txt-Demodateien). Sonst Platzhalter.
 */
export class MockOCRProvider implements OCRProvider {
  readonly name = "mock";
  isConfigured() {
    return true;
  }

  async extractText(input: OcrInput): Promise<OcrResult> {
    let text = "";
    if (input.buffer) {
      try {
        text = input.buffer.toString("utf-8");
      } catch {
        text = "";
      }
    }
    if (!text || !isProbablyText(text)) {
      // Kein extrahierbarer Text (z.B. echtes PDF im Mock) -> Hinweis-Text.
      text = `[[mock-ocr] ${input.originalName}]`;
    }
    const pages = text
      .split(/\f|\n----PAGE----\n/)
      .map((t, i) => ({ pageNumber: i + 1, text: t, width: 1240, height: 1754 }));
    return { pageCount: pages.length, pages, fullText: text };
  }
}

/**
 * Stub für Azure Document Intelligence (EU-Region).
 * TODO(prod): Layout-/Prebuilt-Modelle aufrufen, Seitenboxen + Text liefern.
 */
export class AzureDocumentIntelligenceProvider implements OCRProvider {
  readonly name = "azure-document-intelligence";
  isConfigured() {
    const env = getEnv();
    return Boolean(
      env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT &&
        env.AZURE_DOCUMENT_INTELLIGENCE_KEY
    );
  }
  async extractText(_input: OcrInput): Promise<OcrResult> {
    throw new Error(
      "AzureDocumentIntelligenceProvider ist ein Stub. OCR_PROVIDER=mock verwenden oder implementieren."
    );
  }
}

function isProbablyText(s: string): boolean {
  // Heuristik: druckbarer Anteil hoch genug
  const printable = s.replace(/[^\x20-\x7EäöüÄÖÜß\n\r\t]/g, "");
  return printable.length / Math.max(1, s.length) > 0.85;
}
