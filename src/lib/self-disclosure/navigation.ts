import { KATALOG, anzahlAntragsteller } from "@/lib/self-disclosure/catalog";
import { sichtbareFelder } from "@/lib/self-disclosure/felder";
import type { Antworten, SichtbarerSchritt } from "@/lib/self-disclosure/types";

/** Antwortschlüssel aus Schritt-ID (ggf. mit Personenpräfix) und Feld-ID. */
export function schluessel(schrittId: string, feldId: string): string {
  return `${schrittId}.${feldId}`;
}

/**
 * Die Kette der Schritte, die bei diesen Antworten tatsächlich zu sehen sind.
 *
 * Schritte mit `jeAntragsteller` erscheinen bei zwei Antragstellern zweimal,
 * mit den Präfixen "p1."/"p2." – sie stehen direkt hintereinander, damit der
 * Kunde einen Abschnitt zu Ende führt, bevor die zweite Person beginnt.
 */
export function sichtbareSchritte(antworten: Antworten): SichtbarerSchritt[] {
  const personen = anzahlAntragsteller(antworten);
  const out: SichtbarerSchritt[] = [];
  for (const schritt of KATALOG) {
    if (!schritt.jeAntragsteller) {
      if (schritt.sichtbar && !schritt.sichtbar(antworten)) continue;
      out.push({ id: schritt.id, schritt });
      continue;
    }
    for (let p = 1; p <= personen; p++) {
      const person = p as 1 | 2;
      if (schritt.sichtbar && !schritt.sichtbar(antworten, person)) continue;
      out.push({ id: `p${p}.${schritt.id}`, schritt, person });
    }
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
    for (const feld of sichtbareFelder(s.schritt, antworten, s.person)) {
      const v = antworten[schluessel(s.id, feld.id)];
      const leer = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (!leer) continue;
      const person = s.person ? ` (Antragsteller ${s.person})` : "";
      out.push({
        schrittId: s.id,
        feldId: feld.id,
        label: `${feld.label}${person}`,
        abschnitt: s.schritt.abschnitt,
      });
    }
  }
  return out;
}
