import type { Umfang } from "@/lib/self-disclosure/umfang";

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
  /**
   * Prüft NUR ausdrücklich gegebene Antworten – fehlt die Steuerantwort,
   * bleibt das Feld zu. Gleiche Regel wie bei `Schritt.sichtbar`.
   *
   * Gebraucht, seit Seiten mehrere Fragen bündeln: Auf „Objekt & Preis"
   * stehen Kaufpreis, Baukosten und Restschuld nebeneinander, aber je nach
   * Vorhaben gehört genau eines davon dorthin.
   */
  sichtbar?: (a: Antworten, person?: 1 | 2) => boolean;
}

export type Abschnitt =
  | "vorhaben"
  | "person"
  | "beruf"
  | "haushalt"
  | "eigenkapital"
  | "objekt";

export interface Schritt {
  /** Zugleich URL-Segment. */
  id: string;
  /**
   * "kurz" erscheint in BEIDEN Wegen, "voll" nur hinter dem persönlichen Link.
   *
   * Pflichtangabe ohne Vorgabewert: Ein Vorgabewert schöbe jede neu ergänzte
   * Frage stillschweigend in den kurzen Bogen – dorthin, wo jede zusätzliche
   * Frage am teuersten ist.
   */
  umfang: Umfang;
  abschnitt: Abschnitt;
  frage: string;
  hinweis?: string;
  felder: Feld[];
  /**
   * Prüft NUR ausdrücklich gegebene Antworten. Fehlt die Steuerantwort, bleibt
   * der Zweig zu. `person` ist gesetzt, wenn der Schritt `personenSpalten`
   * trägt – die Bedingung entscheidet dann JE SPALTE, nicht für den ganzen
   * Schritt: Bei einem gemischten Paar (eine Person angestellt, die andere
   * selbstständig) bekommt jede Person nur ihre eigene Berufsfrage
   * (`sichtbareSchritte` berechnet `personen` als echte Teilmenge).
   */
  sichtbar?: (a: Antworten, person?: 1 | 2) => boolean;
  /**
   * Beide Antragsteller nebeneinander auf EINEM Bildschirm, je eine Spalte.
   *
   * Vorher hieß das `jeAntragsteller` und erzeugte ZWEI Einträge in der
   * Schrittkette ("p1.person_name", "p2.person_name") – der Kunde beantwortete
   * erst alles für sich, dann dasselbe für den Partner. Ein Paar, das
   * gemeinsam am Rechner sitzt, erwartet beide nebeneinander.
   */
  personenSpalten?: boolean;
}

/** Ein Eintrag einer Liste (Verpflichtungen, Eigenkapital). */
export type ListenEintrag = Record<string, string | number | boolean | null>;

export type AntwortWert = string | number | boolean | ListenEintrag[] | null;

/** Schlüssel: "<schrittId>.<feldId>", bei Personenschritten "p2.person_name.vorname". */
export type Antworten = Record<string, AntwortWert>;

/** Eine konkrete Ausprägung eines Schritts (bei personenSpalten mit beiden Spalten). */
export interface SichtbarerSchritt {
  /** URL-Segment. Traegt KEINEN Personen-Praefix mehr. */
  id: string;
  schritt: Schritt;
  /** Spalten dieses Schritts; fehlt bei Schritten ohne Personenbezug. */
  personen?: (1 | 2)[];
}
