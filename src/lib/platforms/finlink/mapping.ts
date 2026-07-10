import type { FinLinkVorgangDTO } from "./dto";
import type {
  CanonicalCase,
  CanonicalApplicant,
  CanonicalEmployment,
  CanonicalIncome,
  CanonicalProperty,
} from "@/lib/domain/canonical";
import {
  MARITAL_STATUSES,
  EMPLOYMENT_TYPES,
  PROPERTY_TYPES,
  FINANCING_TYPES,
  type MaritalStatus,
  type EmploymentType,
  type PropertyType,
  type FinancingType,
} from "@/lib/domain/enums";

/**
 * Übersetzt einen FinLink-String in einen kanonischen Enum-Wert.
 * Unbekannte Werte -> undefined (kein Raten). Die konkrete FinLink-Vokabel
 * ist provisorisch: hier wird case-insensitiv gegen die kanonischen Werte
 * geprüft. Beim Vorliegen der echten FinLink-Werte werden hier gezielt
 * Aliase ergänzt (z.B. { "married": "verheiratet" }).
 */
function toEnum<T extends string>(allowed: readonly T[], raw: string | undefined): T | undefined {
  if (!raw) return undefined;
  const norm = raw.trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === norm);
}

export function finlinkToCanonical(dto: FinLinkVorgangDTO): CanonicalCase {
  const applicants: CanonicalApplicant[] = dto.antragsteller.map((a, i) => ({
    position: i + 1,
    vorname: a.vorname,
    nachname: a.nachname,
    geburtsdatum: a.geburtsdatum,
    geburtsort: a.geburtsort,
    staatsangehoerigkeit: a.staatsangehoerigkeit,
    familienstand: toEnum<MaritalStatus>(MARITAL_STATUSES, a.familienstand),
    anzahlKinder: a.anzahlKinder,
    strasse: a.strasse,
    plz: a.plz,
    ort: a.ort,
    email: a.email,
    telefon: a.telefon,
  }));

  const employment: CanonicalEmployment[] = [];
  const income: CanonicalIncome[] = [];
  dto.antragsteller.forEach((a, i) => {
    const b = a.beschaeftigung;
    if (b && (b.art || b.beruf || b.arbeitgeber)) {
      employment.push({
        applicantPosition: i + 1,
        beschaeftigungsart: toEnum<EmploymentType>(EMPLOYMENT_TYPES, b.art),
        beruf: b.beruf,
        arbeitgeber: b.arbeitgeber,
      });
    }
    const e = a.einkommen;
    if (e && (e.nettoMonatlich != null || e.bruttoMonatlich != null)) {
      income.push({
        applicantPosition: i + 1,
        nettoMonatlich: e.nettoMonatlich,
        bruttoMonatlich: e.bruttoMonatlich,
      });
    }
  });

  const o = dto.objekt;
  const property: CanonicalProperty | undefined =
    o && (o.art || o.strasse || o.plz || o.ort)
      ? {
          objektart: toEnum<PropertyType>(PROPERTY_TYPES, o.art),
          strasse: o.strasse,
          plz: o.plz,
          ort: o.ort,
        }
      : undefined;

  const f = dto.finanzierung;
  const finanzierungsart = toEnum<FinancingType>(FINANCING_TYPES, f?.art);

  return {
    caseNumber: "", // wird beim Anlegen vergeben (case-writer)
    financingType: finanzierungsart,
    applicants,
    employment,
    income,
    liabilities: [],
    assets: [],
    property,
    financing: {
      finanzierungsart,
      kaufpreis: f?.kaufpreis,
      darlehenswunsch: f?.darlehenswunsch,
    },
    platformIds: { finlinkId: dto.id },
  };
}
