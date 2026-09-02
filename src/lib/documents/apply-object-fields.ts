import { PROPERTY_TYPES, type PropertyType } from "@/lib/domain/enums";
import { parseAddress, type ExtractedFieldLike } from "@/lib/documents/apply-fields";

/**
 * Übernahme KI-extrahierter Objekt-/Finanzierungsfelder in die Falldaten
 * (Property + FinancingRequest).
 *
 * Wird beim manuellen Akzeptieren eines Objekt-Dokuments im Review-Center
 * genutzt ("manuelle Freigabe") – Gegenstück zu computeApplicantUpdate:
 *  - Nur LEERE Feld-Slots werden gefüllt – vorhandene Eingaben bleiben.
 *  - Tolerantes Matching über Key UND Label (die echte KI liefert keine
 *    festen Feld-Keys).
 *  - Nur für Objekt-Dokumente (Exposé, Kaufvertrag, Grundbuch …) – die
 *    Adresse eines Mietvertrags ist NICHT das Finanzierungsobjekt.
 *  - Rein deterministisch/pure → unit-testbar ohne DB.
 */

/** Dokumenttypen, deren Felder sich auf das Finanzierungsobjekt beziehen. */
const OBJECT_DOCUMENT_TYPES = new Set([
  "expose",
  "kaufvertragsentwurf",
  "grundbuchauszug",
  "teilungserklaerung",
  "wohnflaechenberechnung",
  "grundriss",
  "ansichten",
  "flurkarte_lageplan",
  "baubeschreibung",
  "baukostenaufstellung",
  "baugenehmigung",
]);

export function isObjectDocumentType(type: string): boolean {
  return OBJECT_DOCUMENT_TYPES.has(type);
}

/** Aktuelle Objektdaten des Falls (zum Leer-Prüfen); null = Datensatz fehlt noch. */
export interface CurrentProperty {
  objektart?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  wohnflaeche?: number | null;
  nutzflaeche?: number | null;
  grundstuecksflaeche?: number | null;
  baujahr?: number | null;
  zustand?: string | null;
  anzahlZimmer?: number | null;
  anzahlWohneinheiten?: number | null;
  heizungsart?: string | null;
  stellplaetze?: number | null;
  hausgeldMonatlich?: number | null;
  mieteinnahmenMonatlich?: number | null;
}

export interface CurrentFinancing {
  kaufpreis?: number | null;
  baukosten?: number | null;
}

export interface CurrentObjectData {
  property: CurrentProperty | null;
  financing: CurrentFinancing | null;
}

/** Nur die tatsächlich zu setzenden Felder (Prisma-Update-Payloads). */
export interface PropertyUpdate {
  objektart?: PropertyType;
  street?: string;
  zip?: string;
  city?: string;
  wohnflaeche?: number;
  nutzflaeche?: number;
  grundstuecksflaeche?: number;
  baujahr?: number;
  zustand?: string;
  anzahlZimmer?: number;
  anzahlWohneinheiten?: number;
  heizungsart?: string;
  stellplaetze?: number;
  hausgeldMonatlich?: number;
  mieteinnahmenMonatlich?: number;
}

export interface FinancingUpdate {
  kaufpreis?: number;
  baukosten?: number;
}

/** Normalisiert Keys/Labels: klein, Umlaute aufgelöst, nur a-z0-9. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

interface Matcher {
  exact: string[];
  contains?: string[];
}

function matches(m: Matcher, key: string, label: string): boolean {
  const nk = norm(key);
  const nl = norm(label);
  if (m.exact.includes(nk) || m.exact.includes(nl)) return true;
  if (m.contains?.some((c) => nk.includes(c) || nl.includes(c))) return true;
  return false;
}

/**
 * Parst deutsche und englische Zahlangaben: "420.000,00 €", "142 m²",
 * "142,5", "142.5", "ca. 350.000 EUR". Erste Zahl im Text zählt.
 */
export function parseGermanNumber(raw: string): number | undefined {
  const m = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?/.exec(raw);
  if (!m) return undefined;
  let s = m[0]!;
  if (/^\-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    // Deutsches Format: Punkte = Tausender, Komma = Dezimal.
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Mappt freie Objektart-Texte ("freistehendes EFH") auf das PropertyType-Enum. */
export function parsePropertyType(raw: string): PropertyType | undefined {
  const n = norm(raw);
  if (!n) return undefined;
  const rules: Array<[RegExp, PropertyType]> = [
    [/doppelhaus|dhh/, "doppelhaushaelfte"],
    [/reihen(haus|mittel|eck|end)|rmh|reh\b/, "reihenhaus"],
    [/einfamilien|efh/, "einfamilienhaus"],
    [/mehrfamilien|mfh/, "mehrfamilienhaus"],
    // Bungalow und Villa sind für Bank wie Europace ein Einfamilienhaus. Beide
    // Regeln stehen NACH "mehrfamilien", damit eine Mehrfamilienvilla nicht
    // versehentlich zum EFH wird.
    [/bungalow|villa/, "einfamilienhaus"],
    [/eigentumswohnung|etw|wohnung|penthouse|maisonette/, "eigentumswohnung"],
    [/grundstueck|bauplatz|baugrund/, "grundstueck"],
    [/gewerbe/, "gewerbe"],
  ];
  for (const [re, v] of rules) if (re.test(n)) return v;
  return (PROPERTY_TYPES as readonly string[]).includes(raw) ? (raw as PropertyType) : undefined;
}

const OBJEKTART: Matcher = { exact: ["objektart", "objekttyp", "immobilienart", "immobilientyp", "propertytype"], contains: ["objektart"] };
const OBJEKTADRESSE: Matcher = { exact: ["objektadresse", "objektanschrift", "propertyaddress", "adressedesobjekts"], contains: ["objektadresse", "objektanschrift"] };
// Adresse auch in Einzelteilen: Exposé-Portale liefern PLZ und Ort getrennt
// (und die Straße oft gar nicht). Bewusst nur exakte Keys/Labels – "Anbieter
// Adresse" oder "Notarort" dürfen nie als Objektanschrift durchgehen.
const STRASSE: Matcher = { exact: ["strasse", "objektstrasse", "strassehausnummer", "street"] };
const PLZ: Matcher = { exact: ["plz", "postleitzahl", "objektplz", "zip", "zipcode", "postalcode"] };
const ORT: Matcher = { exact: ["ort", "stadt", "objektort", "city"] };
const KAUFPREIS: Matcher = { exact: ["kaufpreis", "kaufsumme", "purchaseprice"], contains: ["kaufpreis"] };
const WOHNFLAECHE: Matcher = { exact: ["wohnflaeche", "livingarea", "livingspace"], contains: ["wohnflaeche"] };
const NUTZFLAECHE: Matcher = { exact: ["nutzflaeche", "usablearea"], contains: ["nutzflaeche"] };
const GRUNDSTUECK: Matcher = { exact: ["grundstuecksflaeche", "grundstuecksgroesse", "plotarea", "plotsize"], contains: ["grundstuecksflaeche", "grundstuecksgroesse"] };
const BAUJAHR: Matcher = { exact: ["baujahr", "yearbuilt", "yearofconstruction", "constructionyear"], contains: ["baujahr"] };
const ZIMMER: Matcher = { exact: ["zimmer", "anzahlzimmer", "zimmeranzahl", "rooms", "numberofrooms"], contains: ["anzahlzimmer"] };
const HEIZUNG: Matcher = { exact: ["heizungsart", "heizung", "heating", "heatingtype"], contains: ["heizungsart"] };
const ZUSTAND: Matcher = { exact: ["objektzustand", "zustand", "condition"], contains: ["objektzustand"] };
const STELLPLAETZE: Matcher = {
  exact: ["stellplaetze", "anzahlstellplaetze", "stellplatzanzahl", "anzahlgaragestellplatz", "anzahlgaragenstellplaetze"],
  contains: ["anzahlstellplaetze"],
};
const WOHNEINHEITEN: Matcher = { exact: ["wohneinheiten", "anzahlwohneinheiten"], contains: ["wohneinheiten"] };
const HAUSGELD: Matcher = { exact: ["hausgeld", "hausgeldmonatlich", "wohngeld"], contains: ["hausgeld"] };
const MIETEINNAHMEN: Matcher = {
  exact: ["mieteinnahmen", "mieteinnahmenmonatlich", "kaltmiete", "nettokaltmiete"],
  contains: ["mieteinnahmen"],
};
const BAUKOSTEN: Matcher = { exact: ["gesamtbaukosten", "baukosten", "constructioncosts"], contains: ["gesamtbaukosten"] };

/**
 * Erkennt Jahresangaben ("Mieteinnahmen jährlich", "Hausgeld p.a."). Die
 * Zielspalten sind Monatswerte und fließen in Haushaltsrechnung und
 * Machbarkeit – ein Jahreswert darin wäre um den Faktor 12 falsch.
 */
/**
 * Erkennt Quadratmeterpreise ("Kaufpreis pro m²"). Sie tragen dasselbe Wort
 * wie der Kaufpreis, sind aber ein Vielfaches kleiner – ohne diese Sperre
 * hinge es an der Reihenfolge der Felder, ob 895.000 € oder 3.688 € als
 * Kaufpreis im Fall landet.
 */
function istQuadratmeterpreis(key: string, label: string): boolean {
  // norm() wirft das Hochzeichen weg: "pro m²" wird zu "prom", "pro_m2" zu "prom2".
  return /prom2?|proqm|proquadratmeter|persqm|persquaremeter/.test(`${norm(key)}|${norm(label)}`);
}

function istJahresangabe(key: string, label: string): boolean {
  const roh = `${key} ${label}`.toLowerCase();
  if (/\bp\.\s?a\.|\bp\.a\b/.test(roh)) return true;
  const n = `${norm(key)}|${norm(label)}`;
  return /jaehrlich|jahres|projahr|annual|peryear/.test(n);
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/**
 * Ermittelt, welche leeren Objekt-/Finanzierungsfelder aus den extrahierten
 * Feldern gefüllt werden können. Gibt die Prisma-Updates sowie die
 * übernommenen Feld-Labels (für Audit/UI).
 */
export function computeObjectUpdate(
  fields: ExtractedFieldLike[],
  current: CurrentObjectData
): { propertyData: PropertyUpdate; financingData: FinancingUpdate; appliedLabels: string[] } {
  const prop = current.property ?? {};
  const fin = current.financing ?? {};
  const propertyData: PropertyUpdate = {};
  const financingData: FinancingUpdate = {};
  const appliedLabels: string[] = [];

  type NumField =
    | "wohnflaeche"
    | "nutzflaeche"
    | "grundstuecksflaeche"
    | "anzahlZimmer"
    | "hausgeldMonatlich"
    | "mieteinnahmenMonatlich";

  const setPropNum = (field: NumField, value: string, label: string) => {
    const n = parseGermanNumber(value);
    if (n === undefined || n <= 0 || !isEmpty(prop[field]) || propertyData[field] !== undefined) return;
    propertyData[field] = n;
    appliedLabels.push(label);
  };

  /** Stückzahlen (Stellplätze, Wohneinheiten): nur ganze Zahlen, kein Runden. */
  const setPropInt = (field: "stellplaetze" | "anzahlWohneinheiten", value: string, label: string) => {
    const n = parseGermanNumber(value);
    if (n === undefined || !Number.isInteger(n) || n <= 0 || !isEmpty(prop[field]) || propertyData[field] !== undefined) return;
    propertyData[field] = n;
    appliedLabels.push(label);
  };

  const setPropStr = (field: "street" | "zip" | "city" | "heizungsart" | "zustand", value: string, label: string) => {
    const v = value.trim();
    if (!v || !isEmpty(prop[field]) || propertyData[field] !== undefined) return;
    propertyData[field] = v;
    appliedLabels.push(label);
  };

  const setFinNum = (field: keyof FinancingUpdate, value: string, label: string) => {
    const n = parseGermanNumber(value);
    if (n === undefined || n <= 0 || !isEmpty(fin[field]) || financingData[field] !== undefined) return;
    financingData[field] = n;
    appliedLabels.push(label);
  };

  for (const f of fields) {
    const value = f.value?.trim();
    if (!value) continue;
    const { key, label } = f;

    if (matches(OBJEKTADRESSE, key, label)) {
      const parts = parseAddress(value);
      if (parts.street) setPropStr("street", parts.street, `${label} (Straße)`);
      if (parts.zip) setPropStr("zip", parts.zip, `${label} (PLZ)`);
      if (parts.city) setPropStr("city", parts.city, `${label} (Ort)`);
      continue;
    }

    if (matches(OBJEKTART, key, label)) {
      const t = parsePropertyType(value);
      if (t && isEmpty(prop.objektart) && propertyData.objektart === undefined) {
        propertyData.objektart = t;
        appliedLabels.push(label);
      }
      continue;
    }

    if (matches(BAUJAHR, key, label)) {
      const n = parseGermanNumber(value);
      if (n !== undefined && Number.isInteger(n) && n >= 1800 && n <= 2100 && isEmpty(prop.baujahr) && propertyData.baujahr === undefined) {
        propertyData.baujahr = n;
        appliedLabels.push(label);
      }
      continue;
    }

    if (matches(STRASSE, key, label)) { setPropStr("street", value, label); continue; }
    if (matches(PLZ, key, label)) { setPropStr("zip", value, label); continue; }
    if (matches(ORT, key, label)) { setPropStr("city", value, label); continue; }
    if (matches(WOHNFLAECHE, key, label)) { setPropNum("wohnflaeche", value, label); continue; }
    if (matches(NUTZFLAECHE, key, label)) { setPropNum("nutzflaeche", value, label); continue; }
    if (matches(GRUNDSTUECK, key, label)) { setPropNum("grundstuecksflaeche", value, label); continue; }
    if (matches(ZIMMER, key, label)) { setPropNum("anzahlZimmer", value, label); continue; }
    if (matches(STELLPLAETZE, key, label)) { setPropInt("stellplaetze", value, label); continue; }
    if (matches(WOHNEINHEITEN, key, label)) { setPropInt("anzahlWohneinheiten", value, label); continue; }
    if (matches(HEIZUNG, key, label)) { setPropStr("heizungsart", value, label); continue; }
    if (matches(ZUSTAND, key, label)) { setPropStr("zustand", value, label); continue; }
    // Monatswerte: eine als Jahressumme ausgewiesene Angabe wird verworfen,
    // nicht umgerechnet – die KI nennt nicht immer verlässlich den Zeitraum.
    if (matches(HAUSGELD, key, label)) {
      if (!istJahresangabe(key, label)) setPropNum("hausgeldMonatlich", value, label);
      continue;
    }
    if (matches(MIETEINNAHMEN, key, label)) {
      if (!istJahresangabe(key, label)) setPropNum("mieteinnahmenMonatlich", value, label);
      continue;
    }
    if (matches(KAUFPREIS, key, label)) {
      if (!istQuadratmeterpreis(key, label)) setFinNum("kaufpreis", value, label);
      continue;
    }
    if (matches(BAUKOSTEN, key, label)) { setFinNum("baukosten", value, label); continue; }
  }

  return { propertyData, financingData, appliedLabels };
}
