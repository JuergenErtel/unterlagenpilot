/**
 * Internes kanonisches Datenmodell für Baufinanzierung.
 * Alle Plattform-Mappings (Europace / FinLink / eHyp home) gehen ueber dieses
 * Modell: internal <-> platform. So bleibt der Datenfluss verlustfrei und
 * nachvollziehbar (z.B. Europace -> internal -> eHyp home).
 */
import type {
  EmploymentType,
  FinancingType,
  MaritalStatus,
  PropertyType,
  UsageType,
} from "./enums";

export interface CanonicalApplicant {
  position: number; // 1, 2, ...
  vorname?: string;
  nachname?: string;
  geburtsdatum?: string; // ISO
  geburtsort?: string;
  staatsangehoerigkeit?: string;
  familienstand?: MaritalStatus;
  anzahlKinder?: number;
  strasse?: string;
  plz?: string;
  ort?: string;
  email?: string;
  telefon?: string;
}

export interface CanonicalEmployment {
  applicantPosition: number;
  beschaeftigungsart?: EmploymentType;
  beruf?: string;
  arbeitgeber?: string;
  arbeitgeberAdresse?: string;
  eintrittsdatum?: string;
  befristetBis?: string | null;
  inProbezeit?: boolean;
}

export interface CanonicalIncome {
  applicantPosition: number;
  nettoMonatlich?: number;
  bruttoMonatlich?: number;
  sonstigeEinnahmen?: number;
  mieteinnahmen?: number;
  einmalzahlungenJaehrlich?: number;
}

export interface CanonicalLiability {
  art?: string; // Ratenkredit, KFZ, Leasing, bestehendes Darlehen ...
  glaeubiger?: string;
  restschuld?: number;
  monatlicheRate?: number;
  abzuloesen?: boolean;
}

export interface CanonicalAsset {
  art?: string; // Bankguthaben, Bausparen, Depot, Eigenleistung ...
  betrag?: number;
  belegt?: boolean; // durch Nachweis belegt?
  quelle?: string;
}

export interface CanonicalProperty {
  objektart?: PropertyType;
  strasse?: string;
  plz?: string;
  ort?: string;
  wohnflaeche?: number;
  nutzflaeche?: number;
  grundstuecksflaeche?: number;
  baujahr?: number;
  zustand?: string;
  anzahlZimmer?: number;
  anzahlWohneinheiten?: number;
  heizungsart?: string;
  energieausweis?: string;
  stellplaetze?: number;
  hausgeldMonatlich?: number;
  mieteinnahmenMonatlich?: number;
  nutzung?: UsageType;
  vermieteterAnteilProzent?: number;
}

export interface CanonicalFinancing {
  finanzierungsart?: FinancingType;
  kaufpreis?: number;
  baukosten?: number;
  modernisierungskosten?: number;
  nebenkosten?: number;
  maklerprovisionProzent?: number;
  eigenkapital?: number;
  darlehenswunsch?: number;
  /** Konkreter Darlehensbetrag nach Zusage (falls bekannt). */
  darlehensbetrag?: number;
  /** Sollzins nach Angebot (% p. a.), falls bekannt – sonst Stress-Annahme. */
  sollzinsProzent?: number;
  kapitalanlage?: boolean;
  selbstnutzung?: boolean;
}

/** Plattform-Vorgangs-IDs */
export interface CanonicalPlatformIds {
  finlinkId?: string;
  europaceVorgangId?: string;
  ehypHomeId?: string;
}

/**
 * Vollständiger kanonischer Fall. Feldgruppen entsprechen exakt den im
 * Mapping-Layer adressierten Gruppen (Antragsteller, Haushalt, Einkommen,
 * Ausgaben, Verbindlichkeiten, Eigenkapital, Objekt, Finanzierung, ...).
 */
export interface CanonicalCase {
  caseNumber: string;
  financingType?: FinancingType;
  applicants: CanonicalApplicant[];
  employment: CanonicalEmployment[];
  income: CanonicalIncome[];
  liabilities: CanonicalLiability[];
  assets: CanonicalAsset[];
  property?: CanonicalProperty;
  financing: CanonicalFinancing;
  platformIds: CanonicalPlatformIds;
  notes?: string;
}

/** Feldgruppen für UI-Kopiermasken und Mapping-Audits */
export const FIELD_GROUPS = [
  "antragsteller",
  "haushaltsdaten",
  "einkommen",
  "ausgaben",
  "verbindlichkeiten",
  "eigenkapital",
  "objekt",
  "finanzierung",
  "darlehenswunsch",
  "sicherheiten",
  "unterlagen",
  "bankanforderungen",
  "notizen",
  "status",
] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];
