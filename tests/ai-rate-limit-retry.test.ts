import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithRateLimitRetry } from "@/lib/ai/http";

/**
 * Hintergrund (05.08.): Beim Fall Colell scheiterten alle 19 Dokumente der
 * KI-Prüfung mit HTTP 429 (Mistral: 50 Requests/min, 50.000 Tokens/min).
 * Der sofortige Retry ohne Wartezeit lief in dasselbe Minutenfenster.
 * fetchWithRateLimitRetry wartet bei 429 (Retry-After bzw. Backoff) und
 * versucht es dann erneut.
 */

const ok = () => ({ ok: true, status: 200, headers: new Headers() }) as unknown as Response;
const rateLimited = (retryAfterSeconds?: number) =>
  ({
    ok: false,
    status: 429,
    headers: new Headers(
      retryAfterSeconds != null ? { "retry-after": String(retryAfterSeconds) } : {}
    ),
    text: async () => '{"message":"Rate limit exceeded"}',
  }) as unknown as Response;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchWithRateLimitRetry", () => {
  it("wiederholt nach 429 mit Wartezeit und liefert die spätere 200-Antwort", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRateLimitRetry("https://api.example.test/v1/chat", { method: "POST" }, 60_000);
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("respektiert den Retry-After-Header (wartet, statt sofort erneut anzufragen)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited(30))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRateLimitRetry("https://api.example.test/v1/chat", { method: "POST" }, 60_000);

    // Direkt nach der 429-Antwort: noch kein zweiter Versuch (er muss warten).
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Nach Ablauf von Retry-After (30s, plus max. 2s Jitter) kommt der zweite Versuch.
    await vi.advanceTimersByTimeAsync(32_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const res = await promise;
    expect(res.status).toBe(200);
  });

  it("gibt nach erschöpften Versuchen die letzte 429-Antwort zurück (Aufrufer wirft regulär)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(rateLimited());
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRateLimitRetry("https://api.example.test/v1/chat", { method: "POST" }, 60_000);
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(429);
    // 1 Erstversuch + begrenzte Wiederholungen (kein Endlos-Retry).
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(5);
  });
});
