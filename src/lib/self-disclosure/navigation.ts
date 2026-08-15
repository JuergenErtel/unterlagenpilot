import { KATALOG, anzahlAntragsteller } from "@/lib/self-disclosure/catalog";
import { sichtbareFelder } from "@/lib/self-disclosure/felder";
import type { Antworten, SichtbarerSchritt } from "@/lib/self-disclosure/types";

/** Antwortschlüssel aus Schritt-ID und Feld-ID, ohne Personenbezug. */
export function schluessel(schrittId: string, feldId: string): string {
  return `${schrittId}.${feldId}`;
}

/**
 * Antwortschlüssel mit Personen-Präfix, wo einer nötig ist.
 *
 * Der Präfix steht seit den Spalten nicht mehr in der Schritt-ID: Ein Schritt
 * erscheint einmal und trägt beide Personen. Gebaut wird er deshalb hier.
 */
export function personenSchluessel(schrittId: string, feldId: string, person?: 1 | 2): string {
  return person ? `p${person}.${schrittId}.${feldId}` : `${schrittId}.${feldId}`;
}

/**
 * Die Kette der Schritte, die bei diesen Antworten tatsächlich zu sehen sind.
 *
 * Ein Schritt mit `personenSpalten` erscheint bei zwei Antragstellern EINMAL,
 * mit zwei Spalten – nicht mehr zweimal hintereinander. Ein Paar, das
 * gemeinsam am Rechner sitzt, erwartet beide nebeneinander, nicht erst ihn
 * und dann sie.
 */
export function sichtbareSchritte(antworten: Antworten): SichtbarerSchritt[] {
  const personen = anzahlAntragsteller(antworten);
  const out: SichtbarerSchritt[] = [];
  for (const schritt of KATALOG) {
    if (schritt.sichtbar && !schritt.sichtbar(antworten)) continue;
    out.push(
      schritt.personenSpalten
        ? { id: schritt.id, schritt, personen: personen === 2 ? [1, 2] : [1] }
        : { id: schritt.id, schritt }
    );
  }
  return out;
}

export function schrittFinden(id: string, antworten: Antworten): SichtbarerSchritt | null {
  return sichtbareSchritte(antworten).find((s) => s.id === id) ?? null;
}

export function naechsterSchritt(id: string, antworten: Antworten): SichtbarerSchritt | null {
  const kette = sichtbareSchritte(antworten);
  const i = kette.findIndex((s) => s.id === id);
  if (i < 0) return null;
  return kette[i + 1] ?? null;
}

export function vorherigerSchritt(id: string, antworten: Antworten): SichtbarerSchritt | null {
  const kette = sichtbareSchritte(antworten);
  const i = kette.findIndex((s) => s.id === id);
  if (i <= 0) return null;
  return kette[i - 1] ?? null;
}

/** 1-basierte Position und Gesamtzahl – Grundlage des Fortschrittsbalkens. */
export function fortschritt(
  id: string,
  antworten: Antworten
): { position: number; gesamt: number } {
  const kette = sichtbareSchritte(antworten);
  const i = kette.findIndex((s) => s.id === id);
  return { position: i < 0 ? 0 : i + 1, gesamt: kette.length };
}

/**
 * Alle sichtbaren Felder ohne Antwort – die Nachfassliste für den Vermittler.
 * Listenfelder zählen als offen, wenn die Liste leer ist.
 */
export function offeneFelder(
  antworten: Antworten
): Array<{ schrittId: string; feldId: string; label: string; abschnitt: string }> {
  const out: Array<{ schrittId: string; feldId: string; label: string; abschnitt: string }> = [];
  for (const s of sichtbareSchritte(antworten)) {
    for (const person of s.personen ?? [undefined]) {
      for (const feld of sichtbareFelder(s.schritt, antworten, person)) {
        const v = antworten[personenSchluessel(s.schritt.id, feld.id, person)];
        const leer = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
        if (!leer) continue;
        const personLabel = person ? ` (Antragsteller ${person})` : "";
        out.push({
          schrittId: s.id,
          feldId: feld.id,
          label: `${feld.label}${personLabel}`,
          abschnitt: s.schritt.abschnitt,
        });
      }
    }
  }
  return out;
}
