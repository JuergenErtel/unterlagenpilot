import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
  process.env.OCR_PROVIDER = "mock";
});

import { AIService } from "@/lib/ai/service";
import { stufeBildEin, BILD_MIN_KONFIDENZ } from "@/lib/documents/bildeinstufung";
import type { AIProvider, AICompletionRequest } from "@/lib/ai/types";

/**
 * Fall Schmidt (06.09.2026): Drei Hausfotos, ein fotografierter Grundriss und
 * eine Flurkarte standen als "unlesbar" da, weil die OCR keinen Text fand.
 * Fuer Dateien ohne Textgrundlage schaut jetzt die Bild-KI aufs Bild.
 */
const bild = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("stufeBildEin (Mock-KI)", () => {
  it("erkennt ein Hausfoto als Objektfoto", async () => {
    const r = await stufeBildEin({ storageKey: "x/y/foto.jpg", mimeType: "image/jpeg", originalName: "Wohnhaus von Westen.jpg", buffer: bild });
    expect(r?.documentType).toBe("objektfoto");
    expect(r!.confidence).toBeGreaterThanOrEqual(BILD_MIN_KONFIDENZ);
  });

  it("erkennt einen fotografierten Grundriss und eine Flurkarte", async () => {
    expect((await stufeBildEin({ storageKey: "k", mimeType: "image/jpeg", originalName: "Grundriss EG.jpg", buffer: bild }))?.documentType).toBe("grundriss");
    expect((await stufeBildEin({ storageKey: "k", mimeType: "image/png", originalName: "Flurkarte mit Umrandung.png", buffer: bild }))?.documentType).toBe(
      "flurkarte_lageplan"
    );
  });

  it("bleibt bei 'sonstige' oder niedriger Konfidenz stumm - das Dokument gilt weiter als unlesbar", async () => {
    // Mock ohne Namenshinweis: sonstige, 0,3.
    expect(await stufeBildEin({ storageKey: "k", mimeType: "image/tiff", originalName: "scan_001.tif", buffer: bild })).toBeNull();
  });

  it("PDF ohne signierte URL (lokaler Storage): kein Versuch, kein Fehler", async () => {
    expect(await stufeBildEin({ storageKey: "k", mimeType: "application/pdf", originalName: "Grundriss.pdf" })).toBeNull();
  });
});

describe("AIService.classifyImageDocument", () => {
  it("reicht das Bild als Medium und den Dateinamen als Hinweis an den Provider", async () => {
    const anfragen: AICompletionRequest[] = [];
    const provider: AIProvider = {
      name: "fake",
      isConfigured: () => true,
      async completeJSON(req) {
        anfragen.push(req);
        return { documentType: "objektfoto", confidence: 0.9, beschreibung: "Einfamilienhaus von Westen" };
      },
    };
    const ai = new AIService(provider);
    const r = await ai.classifyImageDocument({ image: { base64: "QUJD", mimeType: "image/jpeg" } }, { originalName: "Haus.jpg" });
    expect(r.documentType).toBe("objektfoto");
    expect(anfragen).toHaveLength(1);
    expect(anfragen[0]!.schemaName).toBe("bildklassifikation");
    expect(anfragen[0]!.images).toEqual([{ base64: "QUJD", mimeType: "image/jpeg" }]);
    expect(anfragen[0]!.user).toContain("Haus.jpg");
  });

  it("lehnt Typen ausserhalb der Bildliste ab - kein erfundener Ausweis aus einem Foto", async () => {
    const provider: AIProvider = {
      name: "fake",
      isConfigured: () => true,
      async completeJSON() {
        return { documentType: "personalausweis", confidence: 0.99 };
      },
    };
    await expect(new AIService(provider).classifyImageDocument({ image: { base64: "QUJD", mimeType: "image/jpeg" } })).rejects.toThrow(/nicht validiert/);
  });
});
