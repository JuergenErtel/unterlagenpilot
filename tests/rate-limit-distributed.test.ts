import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { checkRateLimit, __resetRateLimits } from "@/lib/auth/rate-limit";

const URL = "https://example.upstash.io";
const TOKEN = "up_token";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});
beforeEach(() => __resetRateLimits());

describe("checkRateLimit (verteilt / Upstash)", () => {
  it("nutzt ohne Upstash-Konfiguration das In-Memory-Limit", async () => {
    for (let i = 0; i < 3; i++) expect((await checkRateLimit("k", 3, 60)).ok).toBe(true);
    expect((await checkRateLimit("k", 3, 60)).ok).toBe(false);
  });

  it("nutzt bei konfiguriertem Upstash die REST-API (INCR + EXPIRE NX)", async () => {
    process.env.UPSTASH_REDIS_REST_URL = URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = TOKEN;
    let sent: { url: string; init: { headers: Record<string, string>; body: string } } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: never) => {
        sent = { url, init };
        return { ok: true, json: async () => [{ result: 1 }, { result: 1 }] };
      })
    );

    const r = await checkRateLimit("login:1.2.3.4", 5, 300);
    expect(r.ok).toBe(true);
    expect(sent!.url).toBe(`${URL}/pipeline`);
    expect(sent!.init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const cmds = JSON.parse(sent!.init.body);
    expect(cmds[0]).toEqual(["INCR", "login:1.2.3.4"]);
    expect(cmds[1][0]).toBe("EXPIRE");
    expect(cmds[1]).toContain("NX");
  });

  it("blockt, wenn der Upstash-Zähler das Limit überschreitet", async () => {
    process.env.UPSTASH_REDIS_REST_URL = URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = TOKEN;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [{ result: 6 }, { result: 0 }] })));
    expect((await checkRateLimit("k", 5, 300)).ok).toBe(false);
  });

  it("fällt bei Upstash-Fehler auf das In-Memory-Limit zurück (kein Crash)", async () => {
    process.env.UPSTASH_REDIS_REST_URL = URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = TOKEN;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" })));
    // Fällt auf In-Memory zurück -> erste Calls ok, dann Block.
    for (let i = 0; i < 2; i++) expect((await checkRateLimit("k2", 2, 60)).ok).toBe(true);
    expect((await checkRateLimit("k2", 2, 60)).ok).toBe(false);
  });
});
