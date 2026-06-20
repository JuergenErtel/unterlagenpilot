import type { AICompletionRequest, AIProvider } from "./types";
import { getEnv } from "@/lib/env";
import { extractJson } from "./json-extract";
import { buildSystemPrompt } from "./azure-provider";

/**
 * Generischer EU-/DSGVO-konformer OpenAI-kompatibler Provider.
 * Geeignet für EU-Anbieter wie Mistral AI (Frankreich) oder jeden anderen
 * OpenAI-kompatiblen Endpunkt in der EU.
 * Aktivierung: AI_PROVIDER=openai-compatible + OPENAI_COMPATIBLE_* in der Umgebung.
 * Endpoint MUSS in der EU liegen / EU-Datenverarbeitung garantieren.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai-compatible";

  isConfigured(): boolean {
    const env = getEnv();
    return Boolean(
      env.OPENAI_COMPATIBLE_BASE_URL &&
        env.OPENAI_COMPATIBLE_API_KEY &&
        env.OPENAI_COMPATIBLE_MODEL
    );
  }

  async completeJSON(req: AICompletionRequest): Promise<unknown> {
    const env = getEnv();
    if (!this.isConfigured()) {
      throw new Error(
        "OpenAICompatibleProvider ist nicht konfiguriert. OPENAI_COMPATIBLE_BASE_URL/API_KEY/MODEL setzen."
      );
    }

    const base = env.OPENAI_COMPATIBLE_BASE_URL!.replace(/\/$/, "");
    const url = `${base}/chat/completions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_COMPATIBLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_COMPATIBLE_MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt(req) },
          { role: "user", content: req.user },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      throw new Error(`EU-OpenAI-kompatibel HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return extractJson(content);
  }
}
