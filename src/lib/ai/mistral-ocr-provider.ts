import type { OCRProvider, OcrInput, OcrResult } from "./types";
import { getEnv } from "@/lib/env";
import { fetchWithTimeout, OCR_TIMEOUT_MS } from "./http";

/**
 * EU-/DSGVO-konforme OCR via Mistral OCR (mistral-ocr-latest).
 * Verarbeitet gescannte PDFs und Fotos (JPG/PNG). Gleicher EU-Anbieter wie das
 * Sprachmodell → ein DPA, eine Datenschutz-Prüfung.
 * Aktivierung: OCR_PROVIDER=mistral. Key: MISTRAL_API_KEY oder Fallback
 * OPENAI_COMPATIBLE_API_KEY (gleiches Mistral-Konto). Keine Daten geloggt.
 */
export class MistralOCRProvider implements OCRProvider {
  readonly name = "mistral";

  private apiKey(): string | undefined {
    const env = getEnv();
    return env.MISTRAL_API_KEY || env.OPENAI_COMPATIBLE_API_KEY;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async extractText(input: OcrInput): Promise<OcrResult> {
    const env = getEnv();
    const key = this.apiKey();
    if (!key) {
      throw new Error(
        "MistralOCRProvider nicht konfiguriert: MISTRAL_API_KEY (oder OPENAI_COMPATIBLE_API_KEY) setzen."
      );
    }
    if (!input.buffer) {
      throw new Error("MistralOCRProvider benötigt den Dateiinhalt (buffer).");
    }

    const isImage = input.mimeType.startsWith("image/");
    const dataUri = `data:${input.mimeType || (isImage ? "image/jpeg" : "application/pdf")};base64,${input.buffer.toString("base64")}`;
    const document = isImage
      ? { type: "image_url" as const, image_url: dataUri }
      : { type: "document_url" as const, document_url: dataUri };

    const res = await fetchWithTimeout(
      `${env.MISTRAL_API_BASE_URL.replace(/\/$/, "")}/ocr`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model: env.MISTRAL_OCR_MODEL, document }),
      },
      OCR_TIMEOUT_MS
    );

    if (!res.ok) {
      // Nur Status loggen – keine Kundendaten.
      throw new Error(`Mistral OCR HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      pages?: Array<{
        index?: number;
        markdown?: string;
        dimensions?: { width?: number; height?: number } | null;
      }>;
    };

    const rawPages = data.pages ?? [];
    const pages = rawPages.map((p, i) => ({
      pageNumber: (p.index ?? i) + 1,
      text: p.markdown ?? "",
      width: p.dimensions?.width,
      height: p.dimensions?.height,
    }));

    return {
      pageCount: pages.length,
      pages,
      fullText: pages.map((p) => p.text).join("\n\n"),
    };
  }
}
