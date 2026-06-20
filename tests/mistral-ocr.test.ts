import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MistralOCRProvider } from "@/lib/ai/mistral-ocr-provider";

/**
 * Live-Test gegen Mistral OCR (EU). Nur mit MISTRAL_OCR_LIVE=1 + gesetztem Key.
 *   MISTRAL_OCR_LIVE=1 npx vitest run tests/mistral-ocr.test.ts
 * Liest ein Test-PDF (Pfad via OCR_TEST_PDF, Default /tmp/test_payslip.pdf).
 */
const RUN = process.env.MISTRAL_OCR_LIVE === "1";
const PDF = process.env.OCR_TEST_PDF || "/tmp/test_payslip.pdf";

describe.runIf(RUN)("Mistral OCR (EU) – echter API-Call", () => {
  it(
    "extrahiert Text aus einem PDF",
    async () => {
      const buffer = readFileSync(PDF);
      const ocr = new MistralOCRProvider();
      const res = await ocr.extractText({
        storageKey: "test/pdf",
        mimeType: "application/pdf",
        originalName: "test_payslip.pdf",
        buffer,
      });
      console.log("OCR Seiten:", res.pageCount);
      console.log("OCR Text:", res.fullText.slice(0, 400));
      expect(res.pageCount).toBeGreaterThanOrEqual(1);
      expect(res.fullText).toMatch(/Mustermann/i);
      expect(res.fullText).toMatch(/Netto|2750/i);
    },
    90_000
  );
});
