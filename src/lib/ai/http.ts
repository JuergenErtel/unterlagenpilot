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
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
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
