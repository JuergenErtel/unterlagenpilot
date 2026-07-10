/**
 * Ziel-Pfade nach dem Login absichern (Open-Redirect-Schutz).
 * Bewusst in einem eigenen Modul (kein "use server"), damit die reine Funktion
 * direkt testbar ist – Server-Action-Dateien dürfen nur async Exporte haben.
 */

/** Steuerzeichen inkl. Tab/CR/LF – Browser entfernen sie beim URL-Parsen. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export function safeRedirect(target: string | null | undefined): string {
  if (!target) return "/dashboard";
  // Zuerst Steuerzeichen entfernen ("/\tevil.com" wuerde sonst die Pruefung
  // passieren und im Browser als "//evil.com" landen).
  const t = target.replace(CONTROL_CHARS, "");
  if (!t.startsWith("/")) return "/dashboard";
  // "//host" UND "/\\host" liest der Browser (WHATWG-URL-Spec) als
  // protokoll-relative URL auf eine fremde Origin – beides ablehnen.
  if (/^\/[/\\]/.test(t)) return "/dashboard";
  return t;
}
