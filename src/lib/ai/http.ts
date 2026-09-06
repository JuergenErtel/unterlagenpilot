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
 * Vierter Schritt seit 06.09. (Fall Schmidt): Ein Burst, den die Drossel
 * (./drossel.ts) nicht ganz abfaengt, braucht ein volles Fenster Ruhe.
 */
const RATE_LIMIT_BACKOFF_MS = [5_000, 20_000, 35_000, 60_000];
/** Obergrenze für Retry-After des Anbieters, damit ein Ausreißer-Header den Lauf nicht blockiert. */
const RATE_LIMIT_MAX_WAIT_MS = 60_000;

/**
 * Wartezeiten (ms) bei vorübergehender Überlast (502/503/504). Deutlich kürzer
 * als beim Kontingent: Hier ist kein Minutenfenster abzuwarten, der Anbieter
 * ist schlicht gerade voll.
 *
 * Gemessen am 12.08.2026 im Banken-Wiki: Drei Bündel fielen mit HTTP 503
 * ("Service temporarily unavailable due to high load, please retry") aus und
 * wurden NICHT wiederholt – die Banken dieser Bündel fehlten stumm in der
 * Antwort. Ein Ausfall des Anbieters darf keine Bank aus einer Auskunft
 * tilgen, die der Vermittler für vollständig hält.
 */
const UEBERLAST_BACKOFF_MS = [1_000, 4_000, 10_000];

/** Vorübergehende Fehler, bei denen ein zweiter Versuch sinnvoll ist. */
const UEBERLAST_STATUS = new Set([502, 503, 504]);

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
  for (let versuch = 0; versuch < RATE_LIMIT_BACKOFF_MS.length; versuch++) {
    const ueberlast = UEBERLAST_STATUS.has(res.status);
    if (res.status !== 429 && !ueberlast) return res;
    // Kontingent 0/min ist kein volles Fenster, sondern ein gesperrtes Modell
    // (Abo-Stufe des Kontos). Gemessen am 06.09.2026: Ein einzelner Klick auf
    // "KI-Nachpruefung" lief so vier Backoffs lang (2 Minuten) ins Leere.
    if (istKontingentGesperrt(res)) return res;

    const retryAfterSeconds = Number(res.headers?.get?.("retry-after"));
    const grundwartezeit = ueberlast
      ? UEBERLAST_BACKOFF_MS[versuch]!
      : RATE_LIMIT_BACKOFF_MS[versuch]!;
    const waitMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds * 1000, RATE_LIMIT_MAX_WAIT_MS)
        : grundwartezeit;
    await sleep(waitMs + Math.random() * 2_000);
    res = await fetchWithTimeout(url, init, timeoutMs, fetchImpl);
  }
  return res;
}

/**
 * 429, bei dem der Anbieter im Header ein Kontingent von 0 Anfragen je Minute
 * meldet. Mistral tut das fuer Modelle, die die Abo-Stufe des Kontos nicht
 * einschliesst – warten aendert daran nichts, nur das Konto.
 */
export function istKontingentGesperrt(res: Pick<Response, "status" | "headers">): boolean {
  if (res.status !== 429) return false;
  const limit = res.headers?.get?.("x-ratelimit-limit-req-minute");
  return limit != null && Number(limit) === 0;
}

/**
 * Fehler, den der KI-Anbieter selbst gemeldet hat (HTTP-Status ausserhalb 2xx).
 * Eigene Klasse, damit die AIService ihn von einer ungueltigen Modellantwort
 * unterscheiden kann: Letztere bekommt einen Reparatur-Versuch, ein
 * Anbieterfehler nicht – der Aufruf waere derselbe und das Ergebnis auch.
 */
export class KiAnbieterFehler extends Error {
  readonly status: number;
  readonly kontingentGesperrt: boolean;

  constructor(message: string, opt: { status: number; kontingentGesperrt?: boolean }) {
    super(message);
    this.name = "KiAnbieterFehler";
    this.status = opt.status;
    this.kontingentGesperrt = opt.kontingentGesperrt ?? false;
  }
}

/** Sucht in einer Fehlerkette (cause) nach dem Anbieterfehler. */
export function findeAnbieterFehler(e: unknown): KiAnbieterFehler | null {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur != null; i++) {
    if (cur instanceof KiAnbieterFehler) return cur;
    cur = cur instanceof Error ? cur.cause : null;
  }
  return null;
}
