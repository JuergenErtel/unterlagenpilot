import type { AICompletionRequest, AIProvider } from "./types";
import { getEnv } from "@/lib/env";
import { extractJson } from "./json-extract";
import { buildSystemPrompt } from "./azure-provider";

/**
 * Baut den User-Inhalt: reiner Text, oder multimodal (Text + Bilder + Dokumente).
 * Bilder als data-URI (image_url), PDFs als abrufbare URL (document_url).
 */
function buildUserContent(req: AICompletionRequest): unknown {
  const images = req.images ?? [];
  const documents = req.documents ?? [];
  if (images.length === 0 && documents.length === 0) return req.user;
  return [
    { type: "text", text: req.user },
    ...images.map((img) => ({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    })),
    ...documents.map((doc) => ({
      type: "document_url",
      document_url: { document_url: doc.url, document_name: doc.name ?? "dokument.pdf" },
    })),
  ];
}

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
          {
            role: "user",
            content: buildUserContent(req),
          },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      // Antwort-Body mitnehmen (gekürzt, keine Kundendaten – nur die Anbieter-Fehlermeldung),
      // damit z.B. "document_url not supported" im Log sichtbar wird statt nur "HTTP 422".
      const body = await res.text().catch(() => "");
      throw new Error(
        `EU-OpenAI-kompatibel HTTP ${res.status}${body ? `: ${body.slice(0, 600)}` : ""}`
      );
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return extractJson(content);
  }
}
