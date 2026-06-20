import type { AICompletionRequest, AIProvider } from "./types";
import { getEnv } from "@/lib/env";

/**
 * Stub für einen EU-/DSGVO-konformen Azure-OpenAI-Provider (EU-Region).
 * Bewusst NICHT mit erratenen Endpunkten/Verträgen ausimplementiert.
 * Aktivierung: AI_PROVIDER=azure-openai + AZURE_OPENAI_* in der Umgebung.
 *
 * TODO(prod): Aufruf der Chat-Completions-/Responses-API mit
 * response_format: json_schema, Konfidenz aus Modellsignalen ableiten,
 * Zero-Data-Retention konfigurieren, KEINE Kundendaten loggen.
 */
export class AzureOpenAIProvider implements AIProvider {
  readonly name = "azure-openai";

  isConfigured(): boolean {
    const env = getEnv();
    return Boolean(
      env.AZURE_OPENAI_ENDPOINT &&
        env.AZURE_OPENAI_API_KEY &&
        env.AZURE_OPENAI_DEPLOYMENT
    );
  }

  async completeJSON(_req: AICompletionRequest): Promise<unknown> {
    if (!this.isConfigured()) {
      throw new Error(
        "AzureOpenAIProvider ist nicht konfiguriert. Bitte AZURE_OPENAI_* setzen oder AI_PROVIDER=mock verwenden."
      );
    }
    // TODO(prod): Echten Azure-OpenAI-Aufruf (EU-Region) implementieren.
    throw new Error(
      "AzureOpenAIProvider.completeJSON ist noch nicht implementiert (Stub). Siehe README → KI/OCR-Konfiguration."
    );
  }
}
