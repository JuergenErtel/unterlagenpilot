import type { BackofficeStatus } from "@/lib/domain/enums";
import { fristLaeuft, istAktiv } from "./status";

/**
 * Fristen im Backoffice rechnen in Werktagen (Montag bis Freitag, Ortszeit
 * Berlin). Feiertage bleiben bewusst aussen vor: Sie sind je Bundesland
 * verschieden, und eine Frist, die am Feiertag "laeuft", ist ein kleinerer
 * Fehler als eine, die wegen eines falschen Feiertagskalenders stillsteht.
 */

const TAG_MS = 86_400_000;

/** Wochentag in Berliner Ortszeit: 0 = Sonntag ... 6 = Samstag. */
function wochentagBerlin(d: Date): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(s);
}

function istWerktag(d: Date): boolean {
  const w = wochentagBerlin(d);
  return w >= 1 && w <= 5;
}

/**
 * Faelligkeit: `werktage` Werktage nach `ab`, Uhrzeit unveraendert.
 * Ein Eingang am Freitag mit 3 Werktagen ist am Mittwoch faellig.
 */
export function faelligkeitNachWerktagen(ab: Date, werktage: number): Date {
  const ergebnis = new Date(ab.getTime());
  let rest = Math.max(0, Math.floor(werktage));
  while (rest > 0) {
    ergebnis.setTime(ergebnis.getTime() + TAG_MS);
    if (istWerktag(ergebnis)) rest -= 1;
  }
  return ergebnis;
}

/** Werktage zwischen zwei Zeitpunkten (negativ, wenn `bis` vor `von` liegt). */
export function werktageZwischen(von: Date, bis: Date): number {
  if (bis < von) return -werktageZwischen(bis, von);
  let n = 0;
  const cursor = new Date(von.getTime());
  while (cursor.getTime() + TAG_MS <= bis.getTime()) {
    cursor.setTime(cursor.getTime() + TAG_MS);
    if (istWerktag(cursor)) n += 1;
  }
  return n;
}

export type SlaZustand = "ok" | "heute" | "gefaehrdet" | "ueberschritten" | "ruht" | "keine";

export interface SlaBewertung {
  zustand: SlaZustand;
  /** Kalendertage bis zur Frist, negativ = ueberschritten. null ohne Frist. */
  tageBisFrist: number | null;
  label: string;
}

/**
 * Bewertet die Frist eines Auftrags.
 *
 * "ruht": Der Auftrag wartet auf den Auftraggeber oder ist pausiert - die
 * Frist ist dann nicht das Problem des Backoffice, und ein rotes Etikett
 * wuerde den Bearbeiter fuer fremdes Warten tadeln. Die Frist selbst bleibt
 * unveraendert stehen und wird beim Fortsetzen wieder bewertet.
 */
export function bewerteSla(input: {
  faelligAm: Date | null;
  status: BackofficeStatus;
  pausiert: boolean;
  jetzt: Date;
}): SlaBewertung {
  if (!input.faelligAm || !istAktiv(input.status)) {
    return { zustand: "keine", tageBisFrist: null, label: "Keine Frist" };
  }
  const tage = Math.ceil((input.faelligAm.getTime() - input.jetzt.getTime()) / TAG_MS);
  if (input.pausiert || !fristLaeuft(input.status)) {
    return { zustand: "ruht", tageBisFrist: tage, label: "Frist ruht" };
  }
  if (tage < 0) {
    return { zustand: "ueberschritten", tageBisFrist: tage, label: `${-tage} ${-tage === 1 ? "Tag" : "Tage"} überfällig` };
  }
  if (tage === 0) return { zustand: "heute", tageBisFrist: 0, label: "Heute fällig" };
  if (tage === 1) return { zustand: "gefaehrdet", tageBisFrist: 1, label: "Morgen fällig" };
  return { zustand: "ok", tageBisFrist: tage, label: `in ${tage} Tagen` };
}

/** Abrechnungsperiode "JJJJ-MM" eines Zeitpunkts (Berliner Ortszeit). */
export function periodeVon(d: Date): string {
  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const jahr = teile.find((t) => t.type === "year")?.value ?? "0000";
  const monat = teile.find((t) => t.type === "month")?.value ?? "00";
  return `${jahr}-${monat}`;
}
