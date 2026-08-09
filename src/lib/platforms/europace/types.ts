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

export interface EuropaceFinanzierungsbaustein extends MitTyp {
  darlehensbetrag?: number;
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
