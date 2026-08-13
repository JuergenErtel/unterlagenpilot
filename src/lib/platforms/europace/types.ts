/**
 * Teilmenge des Europace-Kundenangaben-Schemas, die BaufiDesk sendet.
 * Vollstaendigkeit ist kein Ziel: Europace verlangt formal nur den
 * Datenkontext, alles Weitere ist optional. Der Vertragstest gegen
 * schema/kundenangaben-openapi.json sichert die Struktur ab.
 */

export type Datenkontext = "TEST_MODUS" | "ECHT_GESCHAEFT";

/** Polymorphe Typen tragen einen @type-Diskriminator. */
export interface MitTyp {
  "@type": string;
}

export interface EuropaceAnschrift {
  strasse?: string;
  hausnummer?: string;
  plz?: string;
  ort?: string;
}

export interface EuropacePerson {
  vorname?: string;
  nachname?: string;
}

export interface EuropacePersonendaten {
  person?: EuropacePerson;
  geburtsdatum?: string;
  geburtsort?: string;
  staatsangehoerigkeit?: string;
  familienstand?: MitTyp;
}

export interface EuropaceKontakt {
  email?: string;
  telefonnummer?: { vorwahl?: string; nummer?: string };
}

export interface EuropaceWohnsituation {
  anschrift?: EuropaceAnschrift;
}

export interface EuropaceBeschaeftigungsverhaeltnis {
  arbeitgeber?: { name?: string };
  beschaeftigtSeit?: string;
  probezeit?: boolean;
}

export interface EuropaceBeschaeftigung extends MitTyp {
  beruf?: string;
  beschaeftigungsverhaeltnis?: EuropaceBeschaeftigungsverhaeltnis;
}

export interface EuropaceFinanzielles {
  einkommenNetto?: number;
  beschaeftigung?: EuropaceBeschaeftigung;
}

export interface EuropaceKunde {
  referenzId: string;
  personendaten?: EuropacePersonendaten;
  kontakt?: EuropaceKontakt;
  wohnsituation?: EuropaceWohnsituation;
  finanzielles?: EuropaceFinanzielles;
}

export interface EuropaceHaushaltsvermoegen {
  summeBankUndSparguthaben?: { guthaben?: number };
}

export interface EuropaceFinanzielleSituation {
  vermoegen?: EuropaceHaushaltsvermoegen;
}

export interface EuropaceHaushalt {
  kunden?: EuropaceKunde[];
  finanzielleSituation?: EuropaceFinanzielleSituation;
}

export interface EuropaceGebaeude {
  baujahr?: number;
  nutzung?: { wohnen?: { gesamtflaeche?: number } };
}

export interface EuropaceImmobilientyp extends MitTyp {
  gebaeude?: EuropaceGebaeude;
  grundstuecksgroesse?: number;
}

export interface EuropaceImmobilie {
  adresse?: EuropaceAnschrift;
  typ?: EuropaceImmobilientyp;
}

export interface EuropaceFinanzierungsobjekt {
  immobilie?: EuropaceImmobilie;
}

export interface EuropaceWertInEuroOderProzent {
  einheit: "EURO" | "PROZENT";
  wert: number;
}

export interface EuropaceFinanzierungszweck extends MitTyp {
  kaufpreis?: number;
  nebenkosten?: {
    grunderwerbsteuer?: EuropaceWertInEuroOderProzent;
    maklergebuehr?: EuropaceWertInEuroOderProzent;
    notargebuehr?: EuropaceWertInEuroOderProzent;
  };
}

/**
 * Konditionswuensche am Annuitaetendarlehen.
 *
 * `sondertilgungJaehrlich` ist ein PROZENTSATZ, kein Betrag – deshalb fragt
 * das Erstgespraech seit dem 13.08.2026 auch in Prozent statt ja/nein.
 * `tilgungswunsch` ist polymorph; BaufiDesk sendet nur die Auspraegung "RATE"
 * (die monatliche Wunschrate des Kunden), nie einen Tilgungssatz.
 */
export interface EuropaceAnnuitaetendetails {
  zinsbindungInJahren?: number;
  sondertilgungJaehrlich?: number;
  tilgungswunsch?: MitTyp & { rate?: number };
}

export interface EuropaceFinanzierungsbaustein extends MitTyp {
  darlehensbetrag?: number;
  annuitaetendetails?: EuropaceAnnuitaetendetails;
}

export interface EuropaceFinanzierungsbedarf {
  finanzierungszweck?: EuropaceFinanzierungszweck;
  finanzierungsbausteine?: EuropaceFinanzierungsbaustein[];
}

export interface EuropaceKundenangabenRequest {
  importMetadaten: {
    datenkontext: Datenkontext;
    externeVorgangsId?: string;
    importquelle?: string;
  };
  kundenangaben: {
    haushalte?: EuropaceHaushalt[];
    finanzierungsobjekt?: EuropaceFinanzierungsobjekt;
    finanzierungsbedarf?: EuropaceFinanzierungsbedarf;
  };
}

/**
 * Antwortformen der Europace-Unterlagen-API (GET /dokumente/anforderungen und
 * GET /dokumente/antrag/anforderungen). Quelle: europace/unterlagen-api,
 * swagger.yaml, Schema "Unterlagenanforderung".
 *
 * Fast alles ist optional: Die Spezifikation kennzeichnet kein Feld als
 * required. Wer hier Pflichtfelder annimmt, baut sich einen Absturz bei der
 * ersten Bank, die ein Feld weglaesst.
 */
export interface Produktanbieter {
  id?: string;
  bezeichnung?: string;
}

export interface Bezugskategorie {
  /** antragsteller | immobilie | vorhaben | ratenkredit */
  typ?: string;
  id?: string;
  name?: string;
  rolle?: { typ?: string; name?: string };
}

export interface Unterlagenanforderung {
  id: string;
  code?: string;
  text?: string;
  kurzbezeichnung?: string;
  erfuellungskategorien?: string[];
  produktanbieter?: Produktanbieter;
  bezug?: Bezugskategorie;
  liegtVor?: boolean;
  ausgeblendet?: boolean;
}

/** Auszug aus GET /v3/vorgaenge/{nr}/antraege (Vorgaenge-API v3). */
export interface EuropaceAntrag {
  antragsNummer?: string;
  produktAnbieter?: Produktanbieter;
  status?: { name?: string } | string;
}

/** Auszug aus GET /v3/vorgaenge/{nr}/finanzierungsvorschlaege (Vorgaenge-API v3). */
export interface EuropaceFinanzierungsvorschlag {
  id?: string;
  darlehensSumme?: number;
  rateMonatlich?: number;
  sollZins?: number;
  effektivZins?: number;
  darlehen?: Array<{ produktAnbieter?: Produktanbieter }>;
}
