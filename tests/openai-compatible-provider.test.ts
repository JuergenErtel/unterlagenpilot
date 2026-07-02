import { describe, it, expect, vi, afterEach } from "vitest";

// Provider braucht konfigurierte OPENAI_COMPATIBLE_*-Variablen (vor dem ersten getEnv()-Aufruf).
process.env.OPENAI_COMPATIBLE_BASE_URL = "https://api.mistral.ai/v1";
process.env.OPENAI_COMPATIBLE_API_KEY = "test-key";
process.env.OPENAI_COMPATIBLE_MODEL = "mistral-small-latest";

import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible-provider";

const provider = new OpenAICompatibleProvider();
const req = { schemaName: "selfEmployed", system: "s", user: "u", jsonSchema: {} };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAICompatibleProvider – Fehlerdiagnose", () => {
  it("nimmt den HTTP-Status UND den Antwort-Body in die Fehlermeldung auf", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 422,
        text: async () => '{"detail":"document_url is not supported for this model"}',
      }))
    );

    await expect(provider.completeJSON(req)).rejects.toThrow(/422/);
    await expect(provider.completeJSON(req)).rejects.toThrow(/document_url is not supported/);
  });
});

describe("OpenAICompatibleProvider – Payload-Format", () => {
  it("sendet document_url als String-Feld im Chunk (Mistral-API), nicht verschachtelt", async () => {
    let sentBody: {
      messages: Array<{ role: string; content: unknown }>;
    } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        sentBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: "{}" } }] }),
        };
      })
    );

    await provider.completeJSON({
      ...req,
      documents: [{ url: "https://example.com/grundriss.pdf", name: "grundriss.pdf" }],
    });

    const userContent = sentBody!.messages.find((m) => m.role === "user")!.content as Array<
      Record<string, unknown>
    >;
    const chunk = userContent.find((c) => c.type === "document_url")!;
    expect(chunk.document_url).toBe("https://example.com/grundriss.pdf");
    expect(chunk.document_name).toBe("grundriss.pdf");
  });
});
