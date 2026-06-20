import type { AICompletionRequest, AIProvider } from "./types";
import { getEnv } from "@/lib/env";
import { extractJson } from "./json-extract";

/**
 * EU-/DSGVO-konformer Azure-OpenAI-Provider (EU-Region).
 * Aktivierung: AI_PROVIDER=azure-openai + AZURE_OPENAI_* in der Umgebung.
 * Die Azure-Ressource MUSS in einer EU-Region liegen (z.B. Sweden Central,
 * France Central, Germany West Central) und Zero-Data-Retention konfiguriert
 * sein. Es werden keine Kundendaten geloggt.
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

  async completeJSON(req: AICompletionRequest): Promise<unknown> {
    const env = getEnv();
    if (!this.isConfigured()) {
      throw new Error(
        "AzureOpenAIProvider ist nicht konfiguriert. AZURE_OPENAI_ENDPOINT/API_KEY/DEPLOYMENT setzen oder AI_PROVIDER=mock verwenden."
      );
    }

    const base = env.AZURE_OPENAI_ENDPOINT!.replace(/\/$/, "");
    const url = `${base}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${env.AZURE_OPENAI_API_VERSION}`;

    const system = buildSystemPrompt(req);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": env.AZURE_OPENAI_API_KEY!,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: req.user },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      // Kein Response-Body mit Kundendaten loggen – nur Status.
      throw new Error(`Azure OpenAI HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return extractJson(content);
  }
}

/** Schema-Vertrag in den System-Prompt einbetten (json_object-Modus). */
export function buildSystemPrompt(req: AICompletionRequest): string {
  const schemaPart = req.jsonSchema
    ? `\n\nAntworte AUSSCHLIESSLICH mit gültigem JSON, das exakt diesem JSON-Schema entspricht:\n${JSON.stringify(req.jsonSchema)}`
    : "\n\nAntworte ausschließlich mit gültigem JSON.";
  return `${req.system}${schemaPart}\nKein Fließtext, keine Erklärungen, nur das JSON-Objekt.`;
}
