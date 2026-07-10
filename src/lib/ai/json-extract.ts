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
  //
  // Klammern INNERHALB von Strings dürfen die Tiefe nicht verändern: eine Antwort
  // wie {"notiz": "Gewinn }2023"} würde sonst nach dem "}" im String abgeschnitten
  // und die Analyse scheitern, obwohl das JSON gültig ist.
  const start = trimmed.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
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
