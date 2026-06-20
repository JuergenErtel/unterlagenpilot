import { getEnv } from "@/lib/env";
import type { AIProvider, OCRProvider } from "./types";
import { MockAIProvider } from "./mock-provider";
import { AzureOpenAIProvider } from "./azure-provider";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";
import {
  MockOCRProvider,
  AzureDocumentIntelligenceProvider,
} from "./ocr-provider";
import { MistralOCRProvider } from "./mistral-ocr-provider";

/**
 * Provider-Factory – bewusst getrennt von index.ts/service.ts, um zirkuläre
 * Importe (Temporal Dead Zone) zu vermeiden.
 */

let aiProvider: AIProvider | null = null;
let ocrProvider: OCRProvider | null = null;

export function getAIProvider(): AIProvider {
  if (aiProvider) return aiProvider;
  const env = getEnv();
  switch (env.AI_PROVIDER) {
    case "azure-openai":
      aiProvider = new AzureOpenAIProvider();
      break;
    case "openai-compatible":
      aiProvider = new OpenAICompatibleProvider();
      break;
    case "mock":
    default:
      aiProvider = new MockAIProvider();
  }
  return aiProvider;
}

export function getOCRProvider(): OCRProvider {
  if (ocrProvider) return ocrProvider;
  const env = getEnv();
  switch (env.OCR_PROVIDER) {
    case "mistral":
      ocrProvider = new MistralOCRProvider();
      break;
    case "azure-document-intelligence":
      ocrProvider = new AzureDocumentIntelligenceProvider();
      break;
    case "mock":
    case "tesseract":
    default:
      ocrProvider = new MockOCRProvider();
  }
  return ocrProvider;
}
