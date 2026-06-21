import { describe, it, expect } from "vitest";
import { AIService } from "@/lib/ai/service";
import { MockAIProvider } from "@/lib/ai/mock-provider";

const ai = new AIService(new MockAIProvider());

describe("KI-Grundrissanalyse (Mock)", () => {
  it("liefert eine schema-konforme Raumliste", async () => {
    const res = await ai.analyzeFloorplan([{ base64: "ZmFrZQ==", mimeType: "image/png" }]);
    expect(res.rooms.length).toBeGreaterThan(0);
    expect(res.rooms[0]!.kategorie).toBeTruthy();
    expect(res.rooms[0]!.konfidenz).toBeGreaterThanOrEqual(0);
  });
});
