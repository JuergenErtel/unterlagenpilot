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
