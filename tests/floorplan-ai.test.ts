import { describe, it, expect, vi, afterEach } from "vitest";
import { AIService } from "@/lib/ai/service";
import { MockAIProvider } from "@/lib/ai/mock-provider";
import type { AIProvider } from "@/lib/ai/types";

const ai = new AIService(new MockAIProvider());

afterEach(() => {
  vi.restoreAllMocks();
});

describe("KI-Grundrissanalyse (Mock)", () => {
  it("liefert eine schema-konforme Raumliste", async () => {
    const res = await ai.analyzeFloorplan([{ base64: "ZmFrZQ==", mimeType: "image/png" }]);
    expect(res.rooms.length).toBeGreaterThan(0);
    expect(res.rooms[0]!.kategorie).toBeTruthy();
    expect(res.rooms[0]!.konfidenz).toBeGreaterThanOrEqual(0);
  });

  it("akzeptiert PDF-Dokumente (document_url) ohne Bilder", async () => {
    const res = await ai.analyzeFloorplan([], [{ url: "https://example.com/grundriss.pdf", name: "grundriss.pdf" }]);
    expect(res.rooms.length).toBeGreaterThan(0);
  });

  it("loggt Schema-Fehler statt still eine leere Raumliste zu liefern", async () => {
    const badProvider: AIProvider = {
      name: "bad",
      isConfigured: () => true,
      // Realistischer LLM-Fehlerfall: Fläche als deutscher Zahl-String statt number.
      completeJSON: async () => ({ rooms: [{ raumname: "Wohnen", flaecheM2: "12,5" }] }),
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await new AIService(badProvider).analyzeFloorplan([{ base64: "ZmFrZQ==", mimeType: "image/png" }]);
    expect(res.rooms).toEqual([]);
    expect(spy).toHaveBeenCalled();
  });
});
