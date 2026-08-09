/**
 * fetch mit hartem Timeout (AbortController). Ohne Timeout hängt ein langsamer/
 * nicht antwortender Anbieter (Mistral OCR/LLM) den gesamten Request bis zum
 * Plattform-Kill – genau das ließ Upload/KI-Prüfung "unendlich" wirken.
 * Bei Zeitüberschreitung wird der Request abgebrochen und wirft (AbortError),
 * sodass die aufrufende Pipeline sauber in ihren Fehlerpfad läuft.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Zeitüberschreitung nach ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Standard-Timeouts (ms) für externe KI-Aufrufe. */
export const AI_TIMEOUT_MS = 60_000; // Chat-Completion (kurzer, getruncateter Prompt)
export const OCR_TIMEOUT_MS = 120_000; // OCR ganzer PDFs kann länger dauern

/**
 * Wartezeiten (ms) vor erneutem Versuch nach HTTP 429. Die Mistral-Limits sind
 * Minutenfenster (Requests/min, Tokens/min) – die Wartezeiten müssen also einen
 * Fensterwechsel überbrücken können, sonst läuft der Retry ins selbe Limit
 * (genau das ließ am 05.08. alle 19 Colell-Dokumente auf "fehler" laufen).
 */
const RATE_LIMIT_BACKOFF_MS = [5_000, 20_000, 35_000];
/** Obergrenze für Retry-After des Anbieters, damit ein Ausreißer-Header den Lauf nicht blockiert. */
const RATE_LIMIT_MAX_WAIT_MS = 60_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wie fetchWithTimeout, wartet aber bei HTTP 429 (Rate Limit) und versucht es
 * erneut – bevorzugt gemäß Retry-After-Header, sonst mit festem Backoff plus
 * Jitter (damit parallel prüfende Dokumente nicht erneut gleichzeitig anfragen).
 * Nach erschöpften Versuchen wird die letzte 429-Antwort zurückgegeben, damit
 * der Aufrufer seinen regulären Fehlerpfad (Status + Body loggen) behält.
 */
export async function fetchWithRateLimitRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  let res = await fetchWithTimeout(url, init, timeoutMs, fetchImpl);
  for (const backoffMs of RATE_LIMIT_BACKOFF_MS) {
    if (res.status !== 429) return res;
    const retryAfterSeconds = Number(res.headers?.get?.("retry-after"));
    const waitMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds * 1000, RATE_LIMIT_MAX_WAIT_MS)
        : backoffMs;
    await sleep(waitMs + Math.random() * 2_000);
    res = await fetchWithTimeout(url, init, timeoutMs, fetchImpl);
  }
  return res;
}
