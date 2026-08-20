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
  // Zwei Namenssaetze: UPSTASH_* (Upstash direkt) und KV_REST_API_* (so
  // injiziert der Vercel-Marketplace die Upstash-for-Redis-Integration).
  // Beide zeigen auf dieselbe REST-API; der jeweils gesetzte gewinnt.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
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

/**
 * Nur Schluessel mit diesem Praefix duerfen vorzeitig freigegeben werden.
 * Bewusste Schranke: `checkRateLimit`/`rateLimit` sichern auch echte
 * Sicherheitszaehler ab (Login, Registrierung, Passwort-Reset) -- ohne diese
 * Schranke koennte ein spaeterer, unbedachter Aufruf von `releaseRateLimit`
 * mit einem falschen Schluessel versehentlich einen solchen Zaehler
 * zuruecksetzen und damit den Brute-Force-Schutz aushebeln. Diese Funktion
 * ist ausdruecklich nur fuer den kurzlebigen Europace-Mutex gedacht (siehe
 * `uebertragung.ts`).
 */
const FREIGABEFAEHIGES_PRAEFIX = "europace-";

/**
 * Gibt eine Beanspruchung vorzeitig frei, bevor ihr Fenster regulär abläuft.
 * Gedacht für Aufrufer, die `checkRateLimit`/`rateLimit` mit `max=1` als
 * kurzlebigen Mutex um einen kritischen Abschnitt zweckentfremden (siehe
 * `uebertragung.ts`): nach erfolgreichem oder fehlgeschlagenem Abschnitt soll
 * ein zweiter, regulärer Versuch sofort wieder durchkommen, statt bis zum
 * Fensterende zu warten.
 *
 * Wirkt NUR auf den In-Memory-Speicher. Ist Upstash Redis konfiguriert, tut
 * diese Funktion bewusst NICHTS – der Zähler dort läuft regulär mit
 * `windowSec` ab, statt vorzeitig freigegeben zu werden. Ein verteiltes DEL
 * über die Upstash-REST-Pipeline wäre technisch denkbar, ließe sich hier aber
 * nicht gegen echtes Upstash verifizieren (in diesem Projekt bislang nirgends
 * konfiguriert) – lieber ein benannter Teilweg als ungetesteter Code, der nur
 * so tut, als würde er freigeben. Bestehende Aufrufer von `checkRateLimit`
 * (Login, Registrierung, Passwort-Reset, Upload, Einkommen) rufen diese
 * Funktion nicht auf und sind von ihr nicht betroffen.
 */
export function releaseRateLimit(key: string): void {
  if (!key.startsWith(FREIGABEFAEHIGES_PRAEFIX)) return;
  if (upstashConfig()) return;
  buckets.delete(key);
}
