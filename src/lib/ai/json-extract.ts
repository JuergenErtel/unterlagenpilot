/**
 * Extrahiert ein JSON-Objekt aus einer LLM-Textantwort.
 * Toleriert ```json ... ``` Codeblöcke und vorangestellten/abschließenden Text.
 * Wirft bei nicht-parsbarer Ausgabe (AIService startet dann Retry/Repair).
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  // 1) Direkt parsbar?
  try {
    return JSON.parse(trimmed);
  } catch {
    /* weiter */
  }

  // 2) Codeblock ```json ... ```
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* weiter */
    }
  }

  // 3) Erstes balanciertes { ... }
  const start = trimmed.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = trimmed.slice(start, i + 1);
          return JSON.parse(candidate); // wirft ggf. -> Retry/Repair
        }
      }
    }
  }

  throw new Error("Keine gültige JSON-Ausgabe im LLM-Text gefunden.");
}
