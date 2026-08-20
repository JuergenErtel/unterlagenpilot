import crypto from "node:crypto";

/**
 * Timing-sicherer Vergleich zweier Strings beliebiger Laenge.
 *
 * `timingSafeEqual` verlangt gleich lange Buffer – deshalb werden beide Seiten
 * erst gehasht: So verraet weder der Inhalt noch die LAENGE des Geheimnisses
 * etwas ueber die Abbruchstelle des Vergleichs. Gedacht fuer Secrets aus
 * Headern (z. B. den Cron-Bearer), wo ein `!==` Zeichen fuer Zeichen abbricht.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
