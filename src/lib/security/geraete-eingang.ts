/**
 * Kleinteile, die sich die beiden Routen des Geraete-Eingangs teilen.
 *
 * Eigenes Modul, damit die Header-Auswertung testbar bleibt, ohne eine
 * Route-Datei (und damit `next/server`) zu laden.
 */

/**
 * Holt das Geraetetoken aus dem Authorization-Header.
 *
 * Apple-Kurzbefehle setzen Header von Hand – ein vergessenes "Bearer " ist
 * dabei der wahrscheinlichste Tippfehler. Der nackte Wert wird deshalb
 * ebenfalls akzeptiert; er ist genauso geheim wie mit Praefix.
 */
export function tokenAusHeader(header: string | null): string | null {
  const roh = (header ?? "").trim();
  if (!roh) return null;
  const ohnePraefix = /^bearer\s+/i.test(roh) ? roh.replace(/^bearer\s+/i, "").trim() : roh;
  return ohnePraefix || null;
}
