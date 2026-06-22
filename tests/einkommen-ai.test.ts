// tests/einkommen-ai.test.ts
import { describe, it, expect } from "vitest";
import { AIService } from "@/lib/ai/service";
import { MockAIProvider } from "@/lib/ai/mock-provider";

const ai = new AIService(new MockAIProvider());

describe("KI-Selbständigen-Analyse (Mock)", () => {
  it("liefert mehrjährige Dokumente", async () => {
    const res = await ai.analyzeSelfEmployedDocs([], [{ url: "https://example.com/euer-2023.pdf", name: "euer.pdf" }]);
    expect(res.docs.length).toBeGreaterThan(1);
    expect(res.docs[0]!.jahr).toBeGreaterThan(2000);
  });
});
