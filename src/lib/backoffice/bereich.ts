/**
 * Die Arbeitsbereiche der Plattform - rein, ohne Datenbank, damit Navigation
 * (Client) und Seiten (Server) dieselbe Regel lesen.
 *
 * Seit dem 17.09.2026 ist KEIN Bereich mehr garantiert. Vorher war der
 * Vertrieb fuer jeden da und diente als sicherer Rueckfall; wer BaufiDesk nur
 * als Unterlagensortierer nutzt, hat ihn nicht. Jede Stelle, die "es gibt
 * immer den Vertrieb" annimmt, ist damit ein Fehler - der Rueckfall geht auf
 * den ERSTEN verfuegbaren Bereich (siehe `ersterBereich`).
 */
export type Bereich = "vertrieb" | "sortierer" | "backoffice" | "portal";

export interface Bereiche {
  vertrieb: boolean;
  sortierer: boolean;
  backoffice: boolean;
  portal: boolean;
}

export const BEREICH_LABELS: Record<Bereich, string> = {
  vertrieb: "Vertrieb",
  sortierer: "Unterlagensortierer",
  backoffice: "Backoffice",
  portal: "Auftraggeberportal",
};

/** Produktname in der Kopfzeile - niemand soll raten, wo er steht. */
export const BEREICH_PRODUKT: Record<Bereich, string> = {
  vertrieb: "BaufiDesk Vertrieb",
  sortierer: "BaufiDesk Sortierer",
  backoffice: "BaufiDesk Backoffice",
  portal: "BaufiDesk Auftraggeberportal",
};

export const BEREICH_START: Record<Bereich, string> = {
  vertrieb: "/heute",
  sortierer: "/sortierer",
  backoffice: "/backoffice",
  portal: "/portal",
};

/**
 * Bereich aus dem Pfad - eine Regel fuer Server und Client.
 *
 * "vertrieb" bleibt die Antwort fuer alles Uebrige, weil die Vertriebspfade
 * keinen gemeinsamen Praefix haben (/heute, /cases, /pipeline, /banken …).
 * Ob der Nutzer diesen Bereich ueberhaupt HAT, entscheidet der Aufrufer -
 * dafuer gibt es `sichtbarerBereich`.
 */
export function bereichAusPfad(pathname: string): Bereich {
  if (pathname === "/sortierer" || pathname.startsWith("/sortierer/")) return "sortierer";
  if (pathname === "/backoffice" || pathname.startsWith("/backoffice/")) return "backoffice";
  if (pathname === "/portal" || pathname.startsWith("/portal/")) return "portal";
  return "vertrieb";
}

/**
 * Reihenfolge des Umschalters; nur sichtbare Bereiche.
 *
 * Der Sortierer steht bewusst hinter dem Vertrieb und vor dem Backoffice:
 * Fuer CRM-Nutzer ist er das Nebenwerkzeug, fuer alle anderen der einzige
 * Eintrag - und dann ist die Reihenfolge ohnehin gleichgueltig.
 */
export function verfuegbareBereiche(b: Bereiche): Bereich[] {
  return (["vertrieb", "sortierer", "backoffice", "portal"] as Bereich[]).filter((k) => b[k]);
}

/**
 * Der erste Bereich, den dieser Nutzer wirklich hat - der Rueckfall, wenn ein
 * Pfad in einen Bereich zeigt, den es fuer ihn nicht gibt.
 *
 * Bis zum 17.09.2026 stand hier fest "vertrieb". Fuer einen Nutzer, der nur
 * den Sortierer hat, waere das eine Weiterleitung auf eine Seite, die ihm
 * 404 antwortet - er kaeme nirgendwo an.
 *
 * Hat jemand GAR keinen Bereich (Konto ohne Freischaltung), bleibt "vertrieb"
 * als letzte Antwort: Die Seite antwortet dann selbst mit 404, und das ist
 * ehrlicher als eine Weiterleitungsschleife.
 */
export function ersterBereich(b: Bereiche): Bereich {
  return verfuegbareBereiche(b)[0] ?? "vertrieb";
}

/**
 * Welchen Bereich die Oberflaeche zeigt: den aus dem Pfad, falls der Nutzer
 * ihn hat - sonst seinen ersten. EINE Regel fuer Navigation und Kopfzeile.
 */
export function sichtbarerBereich(pathname: string, b: Bereiche): Bereich {
  const roh = bereichAusPfad(pathname);
  return b[roh] ? roh : ersterBereich(b);
}

/**
 * Zaehler fuer die Navigation. Nur Aufgaben, die eine Handlung verlangen -
 * eine Null wird nicht angezeigt.
 *
 * Der Name traegt "Backoffice", weil bis auf den Posteingang alles hier aus
 * dem Backoffice stammt. `posteingang` gilt fuer JEDEN Nutzer: Er zaehlt
 * Dateien, die vom Handy kamen und noch keinem Fall gehoeren - ohne Zahl in
 * der Leiste bliebe der Posteingang unbemerkt.
 */
export interface BackofficeZaehler {
  posteingang: number;
  jetztBearbeiten: number;
  qualitaetskontrolle: number;
  uebergabe: number;
  fehlendeUnterlagen: number;
  dokumentePruefen: number;
  rueckfragen: number;
}

export const LEERE_ZAEHLER: BackofficeZaehler = {
  posteingang: 0,
  jetztBearbeiten: 0,
  qualitaetskontrolle: 0,
  uebergabe: 0,
  fehlendeUnterlagen: 0,
  dokumentePruefen: 0,
  rueckfragen: 0,
};
