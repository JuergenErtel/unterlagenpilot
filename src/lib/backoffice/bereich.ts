/**
 * Die drei Arbeitsbereiche der Plattform - rein, ohne Datenbank, damit
 * Navigation (Client) und Seiten (Server) dieselbe Regel lesen.
 */
export type Bereich = "vertrieb" | "backoffice" | "portal";

export interface Bereiche {
  vertrieb: boolean;
  backoffice: boolean;
  portal: boolean;
}

export const BEREICH_LABELS: Record<Bereich, string> = {
  vertrieb: "Vertrieb",
  backoffice: "Backoffice",
  portal: "Auftraggeberportal",
};

/** Produktname in der Kopfzeile - niemand soll raten, wo er steht. */
export const BEREICH_PRODUKT: Record<Bereich, string> = {
  vertrieb: "BaufiDesk Vertrieb",
  backoffice: "BaufiDesk Backoffice",
  portal: "BaufiDesk Auftraggeberportal",
};

export const BEREICH_START: Record<Bereich, string> = {
  vertrieb: "/heute",
  backoffice: "/backoffice",
  portal: "/portal",
};

/** Bereich aus dem Pfad - eine Regel fuer Server und Client. */
export function bereichAusPfad(pathname: string): Bereich {
  if (pathname === "/backoffice" || pathname.startsWith("/backoffice/")) return "backoffice";
  if (pathname === "/portal" || pathname.startsWith("/portal/")) return "portal";
  return "vertrieb";
}

/** Reihenfolge des Umschalters; nur sichtbare Bereiche. */
export function verfuegbareBereiche(b: Bereiche): Bereich[] {
  return (["vertrieb", "backoffice", "portal"] as Bereich[]).filter((k) => b[k]);
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
