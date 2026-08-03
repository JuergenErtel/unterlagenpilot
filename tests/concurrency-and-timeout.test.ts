import { describe, it, expect } from "vitest";
import { fetchWithTimeout } from "@/lib/ai/http";
import { mapLimit } from "@/lib/util/concurrency";

describe("mapLimit", () => {
  it("behält Reihenfolge bei und hält das Nebenläufigkeits-Limit ein", async () => {
    let active = 0;
    let maxActive = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("kommt mit leerer Eingabe klar", async () => {
    expect(await mapLimit([], 3, async () => 1)).toEqual([]);
  });
});

describe("fetchWithTimeout", () => {
  it("bricht ab und wirft, wenn der Request das Timeout überschreitet", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = ((_url: unknown, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal!.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          rej(e);
        });
      })) as typeof fetch;
    try {
      await expect(fetchWithTimeout("https://example.invalid", {}, 20)).rejects.toThrow(
        /Zeitüberschreitung/
      );
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("liefert die Antwort, wenn sie rechtzeitig kommt", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response("ok")) as typeof fetch;
    try {
      const r = await fetchWithTimeout("https://example.invalid", {}, 1000);
      expect(await r.text()).toBe("ok");
    } finally {
      globalThis.fetch = orig;
    }
  });
});
