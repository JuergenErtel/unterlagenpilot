/**
 * Erzeugt den stabilen Teil eines Positionsschluessels.
 *
 * Liegt hier und nicht in einer Action-Datei: Module mit "use server" duerfen
 * nur async Funktionen exportieren. Und es gibt bewusst nur EINE Fassung —
 * zwei Schluesselgeneratoren laufen auseinander und erzeugen Dubletten, die
 * spaeter niemand mehr zuordnen kann.
 */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[äöü]/g, (m) => ({ ä: "ae", ö: "oe", ü: "ue" }[m] ?? m))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}
