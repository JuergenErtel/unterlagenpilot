import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { AIService } from "@/lib/ai/service";
import { KiAnbieterFehler } from "@/lib/ai/http";
import { kiFehlerText } from "@/lib/ai/fehlertext";
import type { AIProvider } from "@/lib/ai/types";

/**
 * Hintergrund (06.09.2026, Fall Schmidt): Der Reparatur-Versuch der
 * AIService ("Antwort war ungueltig, antworte mit gueltigem JSON") ist fuer
 * kaputte Modellantworten gedacht. Bei HTTP 429/403 des Anbieters wiederholte
 * er trotzdem den ganzen Aufruf samt Backoff – doppelte Wartezeit, kein
 * anderes Ergebnis. Ein Anbieterfehler bricht jetzt sofort ab.
 */
describe("AIService bei Anbieterfehlern", () => {
  const schema = z.object({ documentType: z.string() });

  function service(provider: AIProvider) {
    return new AIService(provider);
  }

  it("versucht es bei einem Anbieterfehler NICHT ein zweites Mal", async () => {
    const completeJSON = vi
      .fn()
      .mockRejectedValue(new KiAnbieterFehler("EU-OpenAI-kompatibel HTTP 429: Rate limit exceeded", { status: 429, kontingentGesperrt: true }));
    const svc = service({ name: "test", completeJSON } as unknown as AIProvider);

    await expect(
      // @ts-expect-error – privater Kern, bewusst direkt getestet
      svc.run("classification", schema, "system", "user")
    ).rejects.toThrow(/HTTP 429/);
    expect(completeJSON).toHaveBeenCalledTimes(1);
  });

  it("wiederholt weiterhin, wenn nur die Antwort ungueltig war", async () => {
    const completeJSON = vi
      .fn()
      .mockResolvedValueOnce({ falsch: true })
      .mockResolvedValueOnce({ documentType: "gehaltsabrechnung" });
    const svc = service({ name: "test", completeJSON } as unknown as AIProvider);

    // @ts-expect-error – privater Kern
    const out = await svc.run("classification", schema, "system", "user");
    expect(out.documentType).toBe("gehaltsabrechnung");
    expect(completeJSON).toHaveBeenCalledTimes(2);
  });

  it("behaelt den Anbieterfehler in der Fehlerkette (fuer den Fehlertext am Dokument)", async () => {
    const completeJSON = vi
      .fn()
      .mockRejectedValue(new KiAnbieterFehler("EU-OpenAI-kompatibel HTTP 403: tier_not_allowed", { status: 403 }));
    const svc = service({ name: "test", completeJSON } as unknown as AIProvider);
    // @ts-expect-error – privater Kern
    const err = await svc.run("classification", schema, "system", "user").catch((e: unknown) => e);
    expect(kiFehlerText(err)).toMatch(/Abo/);
  });
});

describe("kiFehlerText", () => {
  it("nennt bei Kontingent 0 das gesperrte Modell und das Konto", () => {
    const e = new KiAnbieterFehler("EU-OpenAI-kompatibel HTTP 429: Rate limit exceeded", {
      status: 429,
      kontingentGesperrt: true,
    });
    const text = kiFehlerText(e);
    expect(text).toMatch(/Konto/);
    expect(text).toMatch(/0 Anfragen/);
  });

  it("unterscheidet ein volles Minutenfenster von einer Sperre", () => {
    const e = new KiAnbieterFehler("EU-OpenAI-kompatibel HTTP 429: Rate limit exceeded", { status: 429 });
    expect(kiFehlerText(e)).toMatch(/erneut prüfen/);
  });

  it("nennt bei 403 die Abo-Stufe", () => {
    const e = new KiAnbieterFehler("EU-OpenAI-kompatibel HTTP 403: tier_not_allowed", { status: 403 });
    expect(kiFehlerText(e)).toMatch(/Abo/);
  });

  it("gibt sonst die gekuerzte Meldung ohne Kundendaten weiter", () => {
    expect(kiFehlerText(new Error("x".repeat(500)))).toHaveLength(200);
    expect(kiFehlerText("kaputt")).toBe("kaputt");
  });
});
