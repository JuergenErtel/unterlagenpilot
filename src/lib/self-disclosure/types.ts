/**
 * Der Fragenkatalog der Selbstauskunft ist reine Datenbeschreibung: Ein Schritt
 * ist ein Bildschirm, ein Feld eine Eingabe. Verzweigungen sind Funktionen über
 * den bisherigen Antworten – keine Verzweigung steckt in der Oberfläche.
 *
 * Grundsatz: Es gibt KEINE Pflichtfelder. Jedes Feld darf leer bleiben.
 */

/** Wohin eine Antwort im Fall gehört. Fehlt das Ziel, bleibt sie nur im Bogen. */
export type Ziel =
  | { entitaet: "case" | "property" | "financingRequest"; feld: string }
  | { entitaet: "applicant" | "income" | "employment" | "selfEmployment"; feld: string }
  | { entitaet: "liability" | "asset"; liste: true };

export type FeldTyp =
  | "auswahl"
  | "betrag"
  | "prozent_oder_betrag"
  | "text"
  | "datum"
  | "plz_ort"
  | "ja_nein"
  | "zahl";

export interface Feld {
  id: string;
  label: string;
  typ: FeldTyp;
  hinweis?: string;
  optionen?: { wert: string; label: string }[];
  ziel?: Ziel;
}

export type Abschnitt =
  | "vorhaben"
  | "person"
  | "beruf"
  | "haushalt"
  | "eigenkapital"
  | "objekt";

export interface Schritt {
  /** Zugleich URL-Segment (bei Personenschritten mit Präfix "p1."/"p2."). */
  id: string;
  abschnitt: Abschnitt;
  frage: string;
  hinweis?: string;
  felder: Feld[];
  /**
   * Prüft NUR ausdrücklich gegebene Antworten. Fehlt die Steuerantwort, bleibt
   * der Zweig zu. `person` ist gesetzt, wenn der Schritt je Antragsteller läuft.
   */
  sichtbar?: (a: Antworten, person?: 1 | 2) => boolean;
  /** Läuft zweimal, wenn zwei Antragsteller angegeben sind. */
  jeAntragsteller?: boolean;
}

/** Ein Eintrag einer Liste (Verpflichtungen, Eigenkapital). */
export type ListenEintrag = Record<string, string | number | boolean | null>;

export type AntwortWert = string | number | boolean | ListenEintrag[] | null;

/** Schlüssel: "<schrittId>.<feldId>", bei Personenschritten "p2.person_name.vorname". */
export type Antworten = Record<string, AntwortWert>;

/** Eine konkrete Ausprägung eines Schritts (bei jeAntragsteller je Person eine). */
export interface SichtbarerSchritt {
  /** URL-Segment und Schlüsselpräfix. */
  id: string;
  schritt: Schritt;
  person?: 1 | 2;
}
