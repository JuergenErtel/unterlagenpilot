import type { DocumentType, Platform, EmploymentType } from "@/lib/domain/enums";

/**
 * Zentrale Registry der Dokumenttypen: Klassifizierungs-Schlüsselwörter,
 * Extraktions-/Pflichtfelder, typische Warnungen (Codes aus dem KO-Katalog),
 * Plattformrelevanz und Checklisten-Zuordnung.
 *
 * Einzige Quelle der Wahrheit – Erkennung (Mock/KI), Extraktion und UI lesen
 * hieraus. Neue Dokumenttypen werden hier deklariert, nicht über den Code verteilt.
 */
export interface DocFieldSpec {
  key: string;
  label: string;
  required: boolean;
}

export interface DocumentTypeSpec {
  type: DocumentType;
  keywords: string[];
  fields: DocFieldSpec[];
  /** Codes aus src/lib/rules/risk-catalog.ts (typische Befunde). */
  warningCodes: string[];
  platformRelevance: Platform[];
  /** Schlüssel der zugehörigen Checklisten-Position (falls vorhanden). */
  checklistKey?: string;
  /** Nur relevant für bestimmte Beschäftigungsarten (z. B. Selbstständige). */
  employmentRelevance?: EmploymentType[];
}

const ALL: Platform[] = ["europace", "finlink", "ehyp_home"];
const QUALITY = ["DOC_UNLESBAR", "DOC_VERALTET"];

function req(key: string, label: string): DocFieldSpec {
  return { key, label, required: true };
}
function opt(key: string, label: string): DocFieldSpec {
  return { key, label, required: false };
}

export const DOCUMENT_TYPE_SPECS: Record<DocumentType, DocumentTypeSpec> = {
  // ---------- MVP-Pflicht (bereits erkannt) ----------
  personalausweis: {
    type: "personalausweis",
    keywords: ["personalausweis", "bundesrepublik deutschland", "ausweisnummer", "personalausweisnummer"],
    fields: [req("vorname", "Vorname"), req("nachname", "Nachname"), req("geburtsdatum", "Geburtsdatum"), opt("geburtsort", "Geburtsort"), opt("gueltigBis", "Gültig bis"), opt("anschrift", "Anschrift")],
    warningCodes: [...QUALITY],
    platformRelevance: ALL,
    checklistKey: "personalausweis",
  },
  gehaltsabrechnung: {
    type: "gehaltsabrechnung",
    keywords: ["gehaltsabrechnung", "entgeltabrechnung", "lohnabrechnung", "brutto", "netto", "steuerklasse", "sozialversicherung"],
    fields: [req("arbeitnehmer", "Name Arbeitnehmer"), req("arbeitgeber", "Arbeitgeber"), req("abrechnungsmonat", "Abrechnungsmonat"), req("brutto", "Brutto"), req("netto", "Netto"), opt("steuerklasse", "Steuerklasse"), opt("austrittsdatum", "Austrittsdatum")],
    warningCodes: ["EMP_AUSTRITT_ERKANNT", "EMP_PROBEZEIT", "INC_STEUERKLASSE_FAMILIENSTAND", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "gehaltsabrechnungen",
    employmentRelevance: ["angestellter", "beamter", "geschaeftsfuehrer"],
  },
  grundbuchauszug: {
    type: "grundbuchauszug",
    keywords: ["grundbuch", "grundbuchamt", "gemarkung", "flurstück", "abteilung", "blattnummer"],
    fields: [req("grundbuchamt", "Grundbuchamt"), req("gemarkung", "Gemarkung"), req("flurstueck", "Flurstück"), opt("grundstuecksgroesse", "Grundstücksgröße"), opt("eigentuemer", "Eigentümer"), opt("abteilungII", "Abteilung II"), opt("abteilungIII", "Abteilung III")],
    warningCodes: ["GB_BELASTUNG_ABT2", "GB_GRUNDSCHULD_ABT3", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "grundbuchauszug",
  },
  expose: {
    type: "expose",
    keywords: ["exposé", "expose", "wohnfläche", "kaufpreis", "baujahr", "objektbeschreibung", "courtage", "provision"],
    fields: [req("objektadresse", "Objektadresse"), req("objektart", "Objektart"), req("kaufpreis", "Kaufpreis"), req("wohnflaeche", "Wohnfläche"), opt("grundstuecksflaeche", "Grundstücksfläche"), opt("baujahr", "Baujahr")],
    warningCodes: ["OBJ_KAUFPREIS_FEHLT", "OBJ_WOHNFLAECHE_FEHLT", "OBJ_GRUNDSTUECK_FEHLT", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "expose",
  },

  // ---------- Neu vorbereitet ----------
  kontoauszug: {
    type: "kontoauszug",
    keywords: ["kontoauszug", "kontostand", "buchung", "iban", "gutschrift", "lastschrift", "rücklastschrift", "saldo"],
    fields: [req("iban", "IBAN"), req("kontoinhaber", "Kontoinhaber"), req("zeitraum", "Zeitraum"), opt("endsaldo", "Endsaldo"), opt("ruecklastschriften", "Rücklastschriften"), opt("pfaendung", "Pfändung/Inkasso")],
    warningCodes: ["ACC_RUECKLASTSCHRIFT", "ACC_PFAENDUNG_INKASSO", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "kontoauszuege",
  },
  eigenkapitalnachweis: {
    type: "eigenkapitalnachweis",
    keywords: ["eigenkapital", "kontostand", "depotauszug", "bausparvertrag", "guthaben", "sparbuch"],
    fields: [req("art", "Art des Eigenkapitals"), req("betrag", "Betrag"), req("stichtag", "Stichtag"), opt("kontoinhaber", "Kontoinhaber")],
    warningCodes: ["EK_NICHT_BELEGT", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "eigenkapitalnachweis",
  },
  kaufvertragsentwurf: {
    type: "kaufvertragsentwurf",
    keywords: ["kaufvertrag", "notar", "urkundenrolle", "auflassung", "verkäufer", "käufer", "kaufpreis"],
    fields: [req("kaufpreis", "Kaufpreis"), req("objektadresse", "Objektadresse"), opt("verkaeufer", "Verkäufer"), opt("notar", "Notar"), opt("notartermin", "Notartermin")],
    warningCodes: ["OBJ_KAUFPREIS_FEHLT", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "kaufvertrag",
  },
  einkommensteuerbescheid: {
    type: "einkommensteuerbescheid",
    keywords: ["einkommensteuerbescheid", "finanzamt", "festsetzung", "zu versteuerndes einkommen", "veranlagungszeitraum"],
    fields: [req("jahr", "Veranlagungsjahr"), req("zuVersteuerndesEinkommen", "Zu versteuerndes Einkommen"), opt("festgesetzteSteuer", "Festgesetzte Steuer"), opt("finanzamt", "Finanzamt")],
    warningCodes: ["SELF_STEUERBESCHEID_FEHLT", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "einkommensteuerbescheid",
    employmentRelevance: ["selbststaendiger", "gesellschafter", "geschaeftsfuehrer"],
  },
  einkommensteuererklaerung: {
    type: "einkommensteuererklaerung",
    keywords: ["einkommensteuererklärung", "anlage", "elster", "werbungskosten"],
    fields: [req("jahr", "Jahr"), opt("einkuenfte", "Einkünfte")],
    warningCodes: [...QUALITY],
    platformRelevance: ALL,
  },
  bwa: {
    type: "bwa",
    keywords: ["bwa", "betriebswirtschaftliche auswertung", "gesamtleistung", "vorläufiges ergebnis", "kostenarten"],
    fields: [req("zeitraum", "Zeitraum"), req("vorlaeufigesErgebnis", "Vorläufiges Ergebnis"), opt("gesamtleistung", "Gesamtleistung")],
    warningCodes: ["SELF_BWA_FEHLT", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "bwa",
    employmentRelevance: ["selbststaendiger", "gesellschafter", "geschaeftsfuehrer"],
  },
  euer: {
    type: "euer",
    keywords: ["einnahmenüberschussrechnung", "euer", "betriebseinnahmen", "betriebsausgaben", "gewinn"],
    fields: [req("jahr", "Jahr"), req("gewinn", "Gewinn"), opt("betriebseinnahmen", "Betriebseinnahmen"), opt("betriebsausgaben", "Betriebsausgaben")],
    warningCodes: [...QUALITY],
    platformRelevance: ALL,
    checklistKey: "euer",
    employmentRelevance: ["selbststaendiger"],
  },
  jahresabschluss: {
    type: "jahresabschluss",
    keywords: ["jahresabschluss", "bilanz", "gewinn- und verlustrechnung", "guv", "aktiva", "passiva"],
    fields: [req("jahr", "Geschäftsjahr"), req("jahresueberschuss", "Jahresüberschuss"), opt("bilanzsumme", "Bilanzsumme")],
    warningCodes: [...QUALITY],
    platformRelevance: ALL,
    checklistKey: "jahresabschluss",
    employmentRelevance: ["gesellschafter", "geschaeftsfuehrer"],
  },
  wohnflaechenberechnung: {
    type: "wohnflaechenberechnung",
    keywords: ["wohnflächenberechnung", "wohnfläche", "wohnflächenverordnung", "raumaufstellung"],
    fields: [req("gesamtwohnflaeche", "Gesamtwohnfläche"), opt("berechnungsgrundlage", "Berechnungsgrundlage")],
    warningCodes: ["OBJ_WOHNFLAECHE_FEHLT", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "wohnflaechenberechnung",
  },
  darlehensvertrag: {
    type: "darlehensvertrag",
    keywords: ["darlehensvertrag", "darlehen", "sollzins", "tilgung", "restschuld", "annuität"],
    fields: [req("darlehensgeber", "Darlehensgeber"), req("restschuld", "Restschuld"), opt("monatlicheRate", "Monatliche Rate"), opt("sollzins", "Sollzins")],
    warningCodes: [...QUALITY],
    platformRelevance: ALL,
    checklistKey: "darlehensvertrag",
  },
  restschuldnachweis: {
    type: "restschuldnachweis",
    keywords: ["restschuld", "restvaluta", "ablösung", "darlehensstand"],
    fields: [req("restschuld", "Restschuld"), req("stichtag", "Stichtag"), opt("glaeubiger", "Gläubiger")],
    warningCodes: [...QUALITY],
    platformRelevance: ALL,
    checklistKey: "restschuldnachweis",
  },
  mietvertrag: {
    type: "mietvertrag",
    keywords: ["mietvertrag", "kaltmiete", "nebenkosten", "mietverhältnis", "mieter", "vermieter"],
    fields: [req("kaltmiete", "Kaltmiete"), req("objektadresse", "Objektadresse"), opt("mietbeginn", "Mietbeginn"), opt("nebenkosten", "Nebenkosten")],
    warningCodes: ["KAP_MIETNACHWEIS_FEHLT", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "mietvertrag",
  },
  mietaufstellung: {
    type: "mietaufstellung",
    keywords: ["mietaufstellung", "mieteinnahmen", "mieterliste", "jahresmiete", "soll-miete"],
    fields: [req("gesamtmiete", "Gesamtmiete (p.a.)"), opt("anzahlEinheiten", "Anzahl Einheiten")],
    warningCodes: ["KAP_MIETNACHWEIS_FEHLT", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "mietaufstellung",
  },
  baubeschreibung: {
    type: "baubeschreibung",
    keywords: ["baubeschreibung", "bauausführung", "gewerke", "ausstattung", "rohbau"],
    fields: [req("bauvorhaben", "Bauvorhaben"), opt("ausstattung", "Ausstattung")],
    warningCodes: ["NEU_BAUKOSTEN_FEHLT", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "baubeschreibung",
  },
  baukostenaufstellung: {
    type: "baukostenaufstellung",
    keywords: ["baukosten", "baukostenaufstellung", "gewerke", "kostenschätzung", "din 276"],
    fields: [req("gesamtbaukosten", "Gesamtbaukosten"), opt("baunebenkosten", "Baunebenkosten"), opt("aussenanlagen", "Außenanlagen")],
    warningCodes: ["NEU_BAUKOSTEN_FEHLT", ...QUALITY],
    platformRelevance: ALL,
    checklistKey: "baukostenaufstellung",
  },
  baugenehmigung: {
    type: "baugenehmigung",
    keywords: ["baugenehmigung", "baubescheid", "bauaufsicht", "genehmigungsbescheid"],
    fields: [req("aktenzeichen", "Aktenzeichen"), req("erteiltAm", "Erteilt am"), opt("behoerde", "Behörde")],
    warningCodes: [...QUALITY],
    platformRelevance: ALL,
    checklistKey: "baugenehmigung",
  },

  // ---------- Weitere vorbereitete Typen ----------
  teilungserklaerung: {
    type: "teilungserklaerung",
    keywords: ["teilungserklärung", "miteigentumsanteil", "sondereigentum", "gemeinschaftsordnung"],
    fields: [req("miteigentumsanteil", "Miteigentumsanteil"), opt("sondereigentum", "Sondereigentum")],
    warningCodes: [...QUALITY],
    platformRelevance: ALL,
  },
  flurkarte_lageplan: {
    type: "flurkarte_lageplan",
    keywords: ["flurkarte", "lageplan", "katasteramt", "liegenschaftskarte"],
    fields: [req("flurstueck", "Flurstück"), opt("massstab", "Maßstab")],
    warningCodes: ["OBJ_GRUNDSTUECK_FEHLT", ...QUALITY],
    platformRelevance: ALL,
  },
  susa: {
    type: "susa",
    keywords: ["summen- und saldenliste", "susa", "konto", "soll", "haben", "saldo"],
    fields: [req("zeitraum", "Zeitraum")],
    warningCodes: [...QUALITY],
    platformRelevance: ALL,
    employmentRelevance: ["selbststaendiger", "geschaeftsfuehrer"],
  },
  rentenbescheid: {
    type: "rentenbescheid",
    keywords: ["rentenbescheid", "deutsche rentenversicherung", "altersrente", "rentenhöhe"],
    fields: [req("rentenbetrag", "Rentenbetrag"), opt("rentenbeginn", "Rentenbeginn")],
    warningCodes: [...QUALITY],
    platformRelevance: ALL,
    employmentRelevance: ["rentner"],
  },
  versicherungsnachweis: {
    type: "versicherungsnachweis",
    keywords: ["versicherung", "police", "versicherungsschein", "risikolebensversicherung", "wohngebäude"],
    fields: [req("versicherungsart", "Versicherungsart"), opt("versicherungssumme", "Versicherungssumme")],
    warningCodes: [...QUALITY],
    platformRelevance: ALL,
  },
  sonstige: {
    type: "sonstige",
    keywords: [],
    fields: [opt("inhalt", "Erkannter Inhalt")],
    warningCodes: [],
    platformRelevance: ALL,
  },
};

/** Klassifizierungs-Schlüsselwörter für alle erkennbaren Typen. */
export function classificationKeywords(): Array<{ type: DocumentType; words: string[] }> {
  return Object.values(DOCUMENT_TYPE_SPECS)
    .filter((s) => s.keywords.length > 0)
    .map((s) => ({ type: s.type, words: s.keywords }));
}

export function getDocumentTypeSpec(type: DocumentType): DocumentTypeSpec {
  return DOCUMENT_TYPE_SPECS[type];
}

/** Pflichtfelder eines Dokumenttyps. */
export function requiredFields(type: DocumentType): DocFieldSpec[] {
  return DOCUMENT_TYPE_SPECS[type].fields.filter((f) => f.required);
}
