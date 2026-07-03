/**
 * Schlankes In-Memory-Rate-Limiting (Sliding Window).
 *
 * Ausreichend für den Single-Instance-Pilotbetrieb. Für horizontale Skalierung
 * (mehrere Server/Serverless-Instanzen) MUSS ein zentraler Store (Upstash Redis,
 * Vercel KV o. Ä.) verwendet werden – sonst gilt das Limit nur pro Instanz.
 * TODO(prod): RateLimiter-Adapter mit verteiltem Backend.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, max: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, remaining: max - 1, retryAfterSec: 0 };
  }
  if (existing.count >= max) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
  }
  existing.count += 1;
  return { ok: true, remaining: max - existing.count, retryAfterSec: 0 };
}

/** Nur für Tests: Buckets zurücksetzen. */
export function __resetRateLimits(): void {
  buckets.clear();
}

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

/**
 * Verteiltes Rate-Limiting: nutzt Upstash Redis (REST) wenn konfiguriert, sonst
 * das In-Memory-Limit. Auf Serverless ist In-Memory pro Instanz – erst Upstash
 * macht das Limit instanzübergreifend wirksam. Bei Upstash-Fehlern wird auf das
 * In-Memory-Limit zurückgefallen (fail-safe, kein Crash).
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSec: number
): Promise<RateLimitResult> {
  const cfg = upstashConfig();
  if (!cfg) return rateLimit(key, max, windowSec);

  try {
    // Fixed-Window-Zähler in einem Round-Trip: INCR + (nur beim ersten Treffer) EXPIRE.
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, windowSec, "NX"],
      ]),
    });
    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
    const data = (await res.json()) as Array<{ result?: number }>;
    const count = Number(data[0]?.result ?? 0);
    if (count > max) return { ok: false, remaining: 0, retryAfterSec: windowSec };
    return { ok: true, remaining: Math.max(0, max - count), retryAfterSec: 0 };
  } catch (e) {
    console.error("[rate-limit] Upstash nicht erreichbar – Fallback auf In-Memory:", e);
    return rateLimit(key, max, windowSec);
  }
}
