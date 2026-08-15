import { KATALOG, anzahlAntragsteller } from "@/lib/self-disclosure/catalog";
import { sichtbareFelder } from "@/lib/self-disclosure/felder";
import type { Umfang } from "@/lib/self-disclosure/umfang";
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
 *
 * `personen` ist dabei eine ECHTE Teilmenge: Bei einem gemischten Paar (eine
 * Person angestellt, die andere selbstständig) bekommt `beruf_arbeitgeber`
 * nur Person 1 und `beruf_selbststaendig` nur Person 2 – nicht beide Spalten
 * für beide, sonst würde die Selbstständige nach Arbeitgeber statt nach ihrer
 * Firma gefragt und ihre Antworten landeten als falsche `employment`-Werte im
 * Fall. Trägt kein Antragsteller die Bedingung, entfällt der Schritt ganz.
 *
 * `umfang` ist bewusst PFLICHT, kein Vorgabewert: Wer ihn vergisst, soll einen
 * Übersetzungsfehler bekommen statt eine Kette, die still auf "voll" fällt.
 */
export function sichtbareSchritte(antworten: Antworten, umfang: Umfang): SichtbarerSchritt[] {
  const anzahl = anzahlAntragsteller(antworten);
  const out: SichtbarerSchritt[] = [];
  for (const schritt of KATALOG) {
    if (umfang === "kurz" && schritt.umfang === "voll") continue;
    if (!schritt.personenSpalten) {
      if (schritt.sichtbar && !schritt.sichtbar(antworten)) continue;
      out.push({ id: schritt.id, schritt });
      continue;
    }
    const personen: (1 | 2)[] = [];
    for (let p = 1; p <= anzahl; p++) {
      const person = p as 1 | 2;
      if (!schritt.sichtbar || schritt.sichtbar(antworten, person)) personen.push(person);
    }
    if (personen.length === 0) continue; // Bedingung trifft auf niemanden zu.
    out.push({ id: schritt.id, schritt, personen });
  }
  return out;
}

/**
 * Alte Schritt-IDs mit Personen-Präfix ("p1.person_name") auf die neue Form
 * ohne Präfix abbilden.
 *
 * `currentStep` steht in der Datenbank und wird nur beim Speichern neu
 * geschrieben – ein Bogen, der VOR den Personen-Spalten mitten in einem
 * Personenschritt abgebrochen wurde, trägt die alte ID weiter, ebenso eine
 * gemerkte URL derselben Form. Ohne dieses Abstreifen fände `schrittFinden`
 * sie nie wieder: Die Schrittseite leitet auf die Einstiegsseite um, die mit
 * demselben `currentStep` sofort zurück – eine Weiterleitungsschleife ohne
 * Selbstheilung (`ERR_TOO_MANY_REDIRECTS`).
 */
function findeInKette(kette: SichtbarerSchritt[], id: string): number {
  const direkt = kette.findIndex((s) => s.id === id);
  if (direkt >= 0) return direkt;
  const ohnePraefix = id.replace(/^p[12]\./, "");
  return ohnePraefix === id ? -1 : kette.findIndex((s) => s.id === ohnePraefix);
}

export function schrittFinden(id: string, antworten: Antworten, umfang: Umfang): SichtbarerSchritt | null {
  const kette = sichtbareSchritte(antworten, umfang);
  const i = findeInKette(kette, id);
  return i < 0 ? null : kette[i]!;
}

export function naechsterSchritt(id: string, antworten: Antworten, umfang: Umfang): SichtbarerSchritt | null {
  const kette = sichtbareSchritte(antworten, umfang);
  const i = kette.findIndex((s) => s.id === id);
  if (i < 0) return null;
  return kette[i + 1] ?? null;
}

export function vorherigerSchritt(id: string, antworten: Antworten, umfang: Umfang): SichtbarerSchritt | null {
  const kette = sichtbareSchritte(antworten, umfang);
  const i = kette.findIndex((s) => s.id === id);
  if (i <= 0) return null;
  return kette[i - 1] ?? null;
}

/** 1-basierte Position und Gesamtzahl – Grundlage des Fortschrittsbalkens. */
export function fortschritt(
  id: string,
  antworten: Antworten,
  umfang: Umfang
): { position: number; gesamt: number } {
  const kette = sichtbareSchritte(antworten, umfang);
  const i = findeInKette(kette, id);
  return { position: i < 0 ? 0 : i + 1, gesamt: kette.length };
}

/**
 * Alle sichtbaren Felder ohne Antwort – die Nachfassliste für den Vermittler.
 * Listenfelder zählen als offen, wenn die Liste leer ist.
 */
export function offeneFelder(
  antworten: Antworten,
  umfang: Umfang
): Array<{ schrittId: string; feldId: string; label: string; abschnitt: string }> {
  const out: Array<{ schrittId: string; feldId: string; label: string; abschnitt: string }> = [];
  for (const s of sichtbareSchritte(antworten, umfang)) {
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
