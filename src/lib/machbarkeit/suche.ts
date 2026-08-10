import { bewerte, type Urteil } from "./bewertung";
import type { HebelDefinition } from "./hebel";
import type { Annahmen, SolverEingabe } from "./types";

export type Ziel = (u: Urteil) => boolean;

/**
 * Immer AUF volle 100 Euro. Eine abgerundete Empfehlung unterschreitet die
 * Schwelle, die sie erreichen soll.
 */
export function aufHundert(n: number): number {
  return Math.ceil(n / 100) * 100;
}

const STUETZSTELLEN = 20;

/**
 * Kleinster Wert des Hebels, bei dem das Ziel erreicht ist.
 *
 * Raster statt Bisektion: zwei Hebel (Inventar, Ratenkredit) wirken NICHT
 * monoton – sie koennen den Fall auch verschlechtern. Bisektion setzt Monotonie
 * voraus und laege dort daneben.
 *
 * Danach wird auf das Ausgabe-Raster gerundet und so weit heruntergegangen, wie
 * es noch traegt. Ohne diesen Schritt waere der genannte Betrag zwar richtig,
 * aber nicht der kleinste – und "14.500 €" soll heissen, dass 14.400 € nicht
 * reichen.
 */
export function kleinsterWert(
  h: HebelDefinition,
  e: SolverEingabe,
  a: Annahmen,
  ziel: Ziel
): { wert: number; urteil: Urteil } | null {
  const anw = h.anwendbar(e, a);
  if (!anw.ok) return null;

  // Schon am Ziel? Dann kostet der Hebel nichts.
  const start = bewerte(e, a);
  if (ziel(start)) return { wert: 0, urteil: start };

  const pruefe = (wert: number): Urteil | null => {
    const u = bewerte(h.anwenden(e, wert), a);
    return ziel(u) ? u : null;
  };

  if (h.diskret) {
    // Vollenumeration: bei Teilmengen gibt es keine sinnvolle Ordnung.
    for (let w = 1; w <= anw.max; w++) {
      const u = pruefe(w);
      if (u) return { wert: w, urteil: u };
    }
    return null;
  }

  // Grobes Raster: erste Stuetzstelle finden, die das Ziel erreicht.
  const grob = anw.max / STUETZSTELLEN;
  let hi: number | null = null;
  for (let i = 1; i <= STUETZSTELLEN; i++) {
    if (pruefe(grob * i)) {
      hi = grob * i;
      break;
    }
  }
  if (hi == null) return null;

  // Auf das Ausgabe-Raster runden: Euro-Hebel auf 100, Prozent-Hebel auf ihren
  // eigenen Schritt (0,05 Prozentpunkte auf 100 zu runden waere Unsinn).
  const raster = h.schrittIstProzent ? anw.schritt : 100;
  const runde = (n: number) => Math.round((Math.ceil(n / raster) * raster) * 1000) / 1000;

  let bester = runde(hi);
  let urteil = pruefe(bester);
  if (!urteil) {
    // Kann bei nicht monotonen Hebeln passieren: dann gilt der ungerundete Wert.
    urteil = pruefe(hi);
    if (!urteil) return null;
    return { wert: hi, urteil };
  }

  // So weit heruntergehen, wie es noch traegt.
  for (;;) {
    const kleiner = Math.round((bester - raster) * 1000) / 1000;
    if (kleiner <= 0) break;
    const u = pruefe(kleiner);
    if (!u) break;
    bester = kleiner;
    urteil = u;
  }

  return { wert: bester, urteil };
}
