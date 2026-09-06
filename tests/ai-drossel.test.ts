import { describe, it, expect, vi, afterEach } from "vitest";
import { KiDrossel } from "@/lib/ai/drossel";

/**
 * Hintergrund (Fall Schmidt, 06.09.2026): 14 Dateien in 7 Sekunden hochgeladen,
 * jede loest OCR, Einstufung, Extraktion, Aufteilungs- und Buendelungs-
 * erkennung aus - rund 70 Anfragen gegen 50/min. Mistral antwortete mit 429,
 * der Retry lief ins selbe Minutenfenster, 9 Text-PDFs blieben auf "fehler".
 * Die Drossel begrenzt je Instanz die gleichzeitigen KI-Anfragen UND den
 * Mindestabstand zwischen zwei Starts.
 */
afterEach(() => {
  vi.useRealTimers();
});

describe("KiDrossel", () => {
  it("laesst hoechstens maxParallel Aufgaben gleichzeitig laufen", async () => {
    vi.useFakeTimers();
    const d = new KiDrossel({ maxParallel: 2, minAbstandMs: 0 });
    let laufend = 0;
    let spitze = 0;
    const aufgabe = () =>
      d.mit(async () => {
        laufend++;
        spitze = Math.max(spitze, laufend);
        await new Promise((r) => setTimeout(r, 100));
        laufend--;
        return "ok";
      });
    const alle = Promise.all([aufgabe(), aufgabe(), aufgabe(), aufgabe(), aufgabe()]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await alle).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(spitze).toBe(2);
  });

  it("haelt den Mindestabstand zwischen zwei Starts ein", async () => {
    vi.useFakeTimers();
    const d = new KiDrossel({ maxParallel: 10, minAbstandMs: 1000 });
    const starts: number[] = [];
    const aufgabe = () =>
      d.mit(async () => {
        starts.push(Date.now());
      });
    const alle = Promise.all([aufgabe(), aufgabe(), aufgabe()]);
    await vi.advanceTimersByTimeAsync(5000);
    await alle;
    expect(starts).toHaveLength(3);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(1000);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(1000);
  });

  it("gibt den Platz auch nach einem Fehler frei", async () => {
    vi.useFakeTimers();
    const d = new KiDrossel({ maxParallel: 1, minAbstandMs: 0 });
    const kaputt = d.mit(async () => {
      throw new Error("boom");
    });
    await expect(kaputt).rejects.toThrow("boom");
    const danach = d.mit(async () => 42);
    await vi.advanceTimersByTimeAsync(10);
    expect(await danach).toBe(42);
    expect(d.stand()).toEqual({ laufend: 0, wartend: 0 });
  });
});
