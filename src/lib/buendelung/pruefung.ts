import type { Kandidat } from "./kandidaten";
import { MIN_KANDIDATEN, type BuendelVorschlag } from "./types";

/**
 * Je Buendel, nicht als Mittelwert: sonst zieht ein sehr sicheres Buendel zwei
 * unsichere mit durch.
 */
export const MIN_KONFIDENZ = 0.7;

export interface Pruefergebnis {
  angenommen: BuendelVorschlag[];
  verworfen: Array<{ titel: string; grund: string }>;
}

/**
 * Entscheidet, welche der von der KI vorgeschlagenen Buendel ueberhaupt
 * angezeigt werden.
 *
 * Bewusst hier und nicht im Prompt: Ein Modell, das gruppieren soll,
 * gruppiert - notfalls zwei Gehaltsabrechnungen aus verschiedenen Monaten. Die
 * Regeln stehen deshalb im Code, wo sie einzeln pruefbar sind.
 *
 * Anders als `pruefeSegmente` beim Auftrennen kippt ein schlechtes Buendel
 * nicht den ganzen Lauf: die uebrigen bleiben stehen. Und Seiten, die zu
 * keinem Buendel gehoeren, bleiben einfach einzeln liegen - das ist hier der
 * Normalfall, kein Fehler.
 */
export function pruefeBuendel(vorschlaege: BuendelVorschlag[], kandidaten: Kandidat[]): Pruefergebnis {
  const angenommen: BuendelVorschlag[] = [];
  const verworfen: Array<{ titel: string; grund: string }> = [];
  // Ueber alle Buendel hinweg: keine Seite darf zweimal vergeben werden, sonst
  // entstuende dieselbe Seite in zwei Dokumenten.
  const schonVergeben = new Set<number>();

  for (const b of vorschlaege) {
    const grund = pruefeEines(b, kandidaten, schonVergeben);
    if (grund) {
      verworfen.push({ titel: b.titel, grund });
      continue;
    }
    for (const i of b.seiten) schonVergeben.add(i);
    angenommen.push(b);
  }

  return { angenommen, verworfen };
}

function pruefeEines(b: BuendelVorschlag, kandidaten: Kandidat[], schonVergeben: Set<number>): string | null {
  if (b.seiten.length < MIN_KANDIDATEN) {
    return "Enthält nur eine einzelne Seite – da ist nichts zusammenzufügen.";
  }
  if (b.confidence < MIN_KONFIDENZ) {
    return `Zu unsicher (Konfidenz ${b.confidence.toFixed(2)}).`;
  }

  const gesehen = new Set<number>();
  for (const i of b.seiten) {
    if (!Number.isInteger(i) || i < 0 || i >= kandidaten.length) {
      return `Seite gibt es nicht (${i}).`;
    }
    if (gesehen.has(i)) return "Enthält dieselbe Seite zweimal.";
    if (schonVergeben.has(i)) return "Enthält eine Seite, die schon in einem anderen Bündel steht.";
    gesehen.add(i);
  }

  // Die schaerfste Regel. Zwei erkannte, verschiedene Zeitraeume in einem
  // Buendel heissen fast immer: zwei Dokumente. Ist bei einer Seite kein
  // Zeitraum erkannt (Seite 2 einer Abrechnung traegt oft keinen Monat), sagt
  // das nichts - dann greift die Regel nicht.
  const zeitraeume = new Set(b.seiten.map((i) => kandidaten[i]!.period).filter((p): p is string => !!p));
  if (zeitraeume.size > 1) {
    return `Enthält Seiten aus verschiedenen Zeitraum-Angaben (${[...zeitraeume].sort().join(", ")}).`;
  }

  return null;
}
