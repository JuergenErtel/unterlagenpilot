import { MARITAL_STATUSES, type MaritalStatus } from "@/lib/domain/enums";

/**
 * Übernahme KI-extrahierter Felder in die Kundenstammdaten (Applicant).
 *
 * Wird beim manuellen Akzeptieren eines Dokuments im Review-Center genutzt
 * ("manuelle Freigabe"). Regeln:
 *  - Nur LEERE Applicant-Felder werden gefüllt – vorhandene Eingaben bleiben.
 *  - Tolerantes Matching: Key UND Label werden normalisiert; die echte KI liefert
 *    keine festen Feld-Keys, daher Alias-Listen statt exakter Key-Gleichheit.
 *  - Rein deterministisch/pure → unit-testbar ohne DB.
 */

export interface ExtractedFieldLike {
  key: string;
  label: string;
  /** Effektiver Wert = correctedValue ?? value (leer/null = keine Übernahme). */
  value: string | null;
}

/** Aktuelle Stammdaten des Ziel-Antragstellers (zum Leer-Prüfen). */
export interface CurrentApplicant {
  vorname?: string | null;
  nachname?: string | null;
  geburtsdatum?: Date | null;
  geburtsort?: string | null;
  staatsangehoerigkeit?: string | null;
  familienstand?: MaritalStatus | null;
  anzahlKinder?: number | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Nur die tatsächlich zu setzenden Felder (Prisma-Update-Payload). */
export interface ApplicantMasterUpdate {
  vorname?: string;
  nachname?: string;
  geburtsdatum?: Date;
  geburtsort?: string;
  staatsangehoerigkeit?: string;
  familienstand?: MaritalStatus;
  anzahlKinder?: number;
  street?: string;
  zip?: string;
  city?: string;
  email?: string;
  phone?: string;
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
  /** exakte normalisierte Aliase (Key oder Label) */
  exact: string[];
  /** normalisierte Teilstrings – nur wo eindeutig (geringe Falsch-Treffer-Gefahr) */
  contains?: string[];
}

function matches(m: Matcher, key: string, label: string): boolean {
  const nk = norm(key);
  const nl = norm(label);
  if (m.exact.includes(nk) || m.exact.includes(nl)) return true;
  if (m.contains?.some((c) => nk.includes(c) || nl.includes(c))) return true;
  return false;
}

/** Parst ISO (YYYY-MM-DD) oder deutsches Datum (TT.MM.JJJJ / TT.MM.JJ). */
export function parseGermanDate(raw: string): Date | undefined {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return safeUTC(+m[1]!, +m[2]! - 1, +m[3]!);
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(s);
  if (m) {
    let y = +m[3]!;
    if (y < 100) y += y > 30 ? 1900 : 2000; // 2-stellig heuristisch
    return safeUTC(y, +m[2]! - 1, +m[1]!);
  }
  return undefined;
}

function safeUTC(y: number, mo: number, d: number): Date | undefined {
  const date = new Date(Date.UTC(y, mo, d, 12, 0, 0)); // Mittag UTC → keine TZ-Verschiebung
  if (Number.isNaN(date.getTime())) return undefined;
  // Rück-Validierung gegen Überläufe (z.B. 31.02.)
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo || date.getUTCDate() !== d) return undefined;
  return date;
}

/** Zerlegt "Musterstraße 12, 76744 Wörth" in Straße/PLZ/Ort. */
export function parseAddress(raw: string): { street?: string; zip?: string; city?: string } {
  const s = raw.trim().replace(/\s+/g, " ");
  const m = /^(.*?),?\s*(\d{5})\s+(.+)$/.exec(s);
  if (m) return { street: m[1]!.replace(/,\s*$/, "").trim() || undefined, zip: m[2], city: m[3]!.trim() };
  return { street: s || undefined };
}

function parseFamilienstand(raw: string): MaritalStatus | undefined {
  const n = norm(raw);
  const rules: Array<[RegExp, MaritalStatus]> = [
    [/verheiratet|married/, "verheiratet"],
    [/geschieden|divorced/, "geschieden"],
    [/verwitwet|widow/, "verwitwet"],
    [/getrennt/, "getrennt_lebend"],
    [/partnerschaft|lebenspartner/, "eingetragene_partnerschaft"],
    [/ledig|single|unverheiratet/, "ledig"],
  ];
  for (const [re, v] of rules) if (re.test(n)) return v;
  // Direkter Enum-Treffer (falls KI exakt liefert)
  return (MARITAL_STATUSES as readonly string[]).includes(raw) ? (raw as MaritalStatus) : undefined;
}

const VORNAME: Matcher = { exact: ["vorname", "firstname", "givenname", "rufname", "vornamen"] };
const NACHNAME: Matcher = { exact: ["nachname", "familienname", "lastname", "surname", "familyname"] };
const GEBURTSDATUM: Matcher = { exact: ["geburtsdatum", "geburtstag", "dateofbirth", "dob", "birthdate"], contains: ["geburtsdat", "geboren"] };
const GEBURTSORT: Matcher = { exact: ["geburtsort", "birthplace", "placeofbirth"], contains: ["geburtsort"] };
const STAAT: Matcher = { exact: ["staatsangehoerigkeit", "nationalitaet", "nationality", "staatsbuergerschaft"], contains: ["staatsange", "nationalit"] };
const FAMILIENSTAND: Matcher = { exact: ["familienstand", "maritalstatus", "personenstand"], contains: ["familienstand", "maritalstatus"] };
const KINDER: Matcher = { exact: ["anzahlkinder", "kinder", "kinderzahl", "numberofchildren"], contains: ["anzahlkinder"] };
const EMAIL: Matcher = { exact: ["email", "emailadresse", "mail", "emailaddress"], contains: ["email"] };
const PHONE: Matcher = { exact: ["telefon", "phone", "mobil", "handy", "telefonnummer", "rufnummer", "mobile"], contains: ["telefon"] };
const ADDRESS_COMBINED: Matcher = { exact: ["anschrift", "adresse", "wohnanschrift", "address", "meldeadresse"] };
const STREET: Matcher = { exact: ["strasse", "street", "strasseundhausnummer", "streetaddress"] };
const ZIP: Matcher = { exact: ["plz", "postleitzahl", "zip", "postalcode", "zipcode"] };
const CITY: Matcher = { exact: ["ort", "stadt", "city", "wohnort"] };

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/**
 * Ermittelt, welche leeren Stammdaten aus den extrahierten Feldern gefüllt werden
 * können. Gibt das Prisma-Update sowie die übernommenen Feld-Labels (für Audit/UI).
 */
export function computeApplicantUpdate(
  fields: ExtractedFieldLike[],
  current: CurrentApplicant
): { data: ApplicantMasterUpdate; appliedLabels: string[] } {
  const data: ApplicantMasterUpdate = {};
  const appliedLabels: string[] = [];

  const setStr = (
    field: keyof ApplicantMasterUpdate,
    currentVal: unknown,
    value: string,
    label: string
  ): boolean => {
    const v = value.trim();
    if (!v || !isEmpty(currentVal) || data[field] !== undefined) return false;
    (data as Record<string, unknown>)[field] = v;
    appliedLabels.push(label);
    return true;
  };

  for (const f of fields) {
    const value = f.value?.trim();
    if (!value) continue;
    const { key, label } = f;

    if (matches(VORNAME, key, label)) { setStr("vorname", current.vorname, value, label); continue; }
    if (matches(NACHNAME, key, label)) { setStr("nachname", current.nachname, value, label); continue; }
    if (matches(GEBURTSORT, key, label)) { setStr("geburtsort", current.geburtsort, value, label); continue; }
    if (matches(STAAT, key, label)) { setStr("staatsangehoerigkeit", current.staatsangehoerigkeit, value, label); continue; }
    if (matches(EMAIL, key, label)) { setStr("email", current.email, value, label); continue; }
    if (matches(PHONE, key, label)) { setStr("phone", current.phone, value, label); continue; }
    if (matches(STREET, key, label)) { setStr("street", current.street, value, label); continue; }
    if (matches(ZIP, key, label)) { setStr("zip", current.zip, value, label); continue; }
    if (matches(CITY, key, label)) { setStr("city", current.city, value, label); continue; }

    if (matches(GEBURTSDATUM, key, label)) {
      const d = parseGermanDate(value);
      if (d && isEmpty(current.geburtsdatum) && data.geburtsdatum === undefined) {
        data.geburtsdatum = d;
        appliedLabels.push(label);
      }
      continue;
    }

    if (matches(FAMILIENSTAND, key, label)) {
      const fs = parseFamilienstand(value);
      if (fs && isEmpty(current.familienstand) && data.familienstand === undefined) {
        data.familienstand = fs;
        appliedLabels.push(label);
      }
      continue;
    }

    if (matches(KINDER, key, label)) {
      const n = parseInt(value.replace(/[^\d]/g, ""), 10);
      if (!Number.isNaN(n) && isEmpty(current.anzahlKinder) && data.anzahlKinder === undefined) {
        data.anzahlKinder = n;
        appliedLabels.push(label);
      }
      continue;
    }

    if (matches(ADDRESS_COMBINED, key, label)) {
      const parts = parseAddress(value);
      if (parts.street) setStr("street", current.street, parts.street, `${label} (Straße)`);
      if (parts.zip) setStr("zip", current.zip, parts.zip, `${label} (PLZ)`);
      if (parts.city) setStr("city", current.city, parts.city, `${label} (Ort)`);
      continue;
    }
  }

  return { data, appliedLabels };
}
