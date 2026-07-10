/**
 * Zentrale Enums / String-Literal-Unions der Baufinanzierungs-Domäne.
 * Diese Werte sind bewusst mit den Prisma-Enums (prisma/schema.prisma) synchron
 * gehalten. Aenderungen hier => Aenderung im Prisma-Schema und umgekehrt.
 */

export const PLATFORMS = ["europace", "finlink", "ehyp_home"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  europace: "Europace",
  finlink: "FinLink",
  ehyp_home: "eHyp home",
};

/** Fallstatus (Lebenszyklus eines Vorgangs) */
export const CASE_STATUSES = [
  "neu",
  "upload_offen",
  "ki_pruefung_laeuft",
  "vermittlerpruefung_erforderlich",
  "unterlagen_fehlen",
  "einreichungsfertig",
  "exportiert",
  "uebertragen",
  "bank_nachforderung",
  "abgeschlossen",
  "archiviert",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/**
 * Fälle in diesen Status sind fachlich abgeschlossen: die KI-Prüfung darf sie
 * nicht mehr verändern (sonst würde ein bereits eingereichter Stand überschrieben).
 */
export const LOCKED_CASE_STATUSES: ReadonlySet<CaseStatus> = new Set<CaseStatus>([
  "exportiert",
  "uebertragen",
  "abgeschlossen",
  "archiviert",
]);

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  neu: "Neu",
  upload_offen: "Upload offen",
  ki_pruefung_laeuft: "KI-Prüfung läuft",
  vermittlerpruefung_erforderlich: "Vermittlerprüfung erforderlich",
  unterlagen_fehlen: "Unterlagen fehlen",
  einreichungsfertig: "Einreichungsfertig",
  exportiert: "Exportiert",
  uebertragen: "Bei Bank eingereicht",
  bank_nachforderung: "Bank-Nachforderung",
  abgeschlossen: "Abgeschlossen",
  archiviert: "Archiviert",
};

/** Art eines Fall-Vermerks (Kontakthistorie). */
export const CASE_NOTE_KINDS = ["notiz", "telefon", "email", "wiedervorlage"] as const;
export type CaseNoteKind = (typeof CASE_NOTE_KINDS)[number];

export const CASE_NOTE_KIND_LABELS: Record<CaseNoteKind, string> = {
  notiz: "Notiz",
  telefon: "Telefonat",
  email: "E-Mail",
  wiedervorlage: "Wiedervorlage",
};

/** Art einer Frist am Fall. */
export const DEADLINE_KINDS = ["zinsbindung", "notartermin", "nachreichung", "sonstige"] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export const DEADLINE_KIND_LABELS: Record<DeadlineKind, string> = {
  zinsbindung: "Zinsbindung Angebot",
  notartermin: "Notartermin",
  nachreichung: "Nachreichfrist Bank",
  sonstige: "Sonstige Frist",
};

/**
 * Häufige Banken/Produktgeber in der Baufinanzierung (Auswahl am Fall). Bewusst
 * eine kuratierte Liste + Freitext, keine erschöpfende Enum – Vermittler nutzen
 * je nach Pool unterschiedliche Häuser.
 */
export const COMMON_BANKS = [
  "ING",
  "DSL Bank",
  "Deutsche Bank",
  "Commerzbank",
  "Sparkasse",
  "Volksbank Raiffeisenbank",
  "PSD Bank",
  "Münchener Hypothekenbank",
  "DKB",
  "Santander",
  "Postbank",
  "Sparda-Bank",
  "BHW",
  "Wüstenrot",
  "Allianz",
  "R+V",
  "Debeka",
  "Hypofriend",
  "Interhyp",
] as const;

/** Startpunkt / Herkunft eines Falls */
export const CASE_SOURCE_TYPES = [
  "finlink_import",
  "kundenformular",
  "dokumenten_upload",
  "manuell",
  "europace_import",
] as const;
export type CaseSourceType = (typeof CASE_SOURCE_TYPES)[number];

/** Finanzierungsart */
export const FINANCING_TYPES = [
  "kauf",
  "neubau",
  "anschlussfinanzierung",
  "umschuldung",
  "modernisierung",
  "kapitalbeschaffung",
] as const;
export type FinancingType = (typeof FINANCING_TYPES)[number];

export const FINANCING_TYPE_LABELS: Record<FinancingType, string> = {
  kauf: "Kauf einer Bestandsimmobilie",
  neubau: "Neubau",
  anschlussfinanzierung: "Anschlussfinanzierung",
  umschuldung: "Umschuldung",
  modernisierung: "Modernisierung",
  kapitalbeschaffung: "Kapitalbeschaffung",
};

/** Beschäftigungsart / Kundentyp */
export const EMPLOYMENT_TYPES = [
  "angestellter",
  "selbststaendiger",
  "beamter",
  "rentner",
  "geschaeftsfuehrer",
  "gesellschafter",
  "sonstiges",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  angestellter: "Angestellte:r",
  selbststaendiger: "Selbstständige:r",
  beamter: "Beamt:in",
  rentner: "Rentner:in",
  geschaeftsfuehrer: "Geschäftsführer:in",
  gesellschafter: "Gesellschafter:in",
  sonstiges: "Sonstiges",
};

/** Familienstand */
/** Baufi-Standard: bis zu zwei Antragsteller je Fall. */
export const MAX_APPLICANTS = 2;

export const MARITAL_STATUSES = [
  "ledig",
  "verheiratet",
  "geschieden",
  "verwitwet",
  "eingetragene_partnerschaft",
  "getrennt_lebend",
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  ledig: "Ledig",
  verheiratet: "Verheiratet",
  geschieden: "Geschieden",
  verwitwet: "Verwitwet",
  eingetragene_partnerschaft: "Eingetragene Partnerschaft",
  getrennt_lebend: "Getrennt lebend",
};

/** Objektart */
export const PROPERTY_TYPES = [
  "einfamilienhaus",
  "doppelhaushaelfte",
  "reihenhaus",
  "eigentumswohnung",
  "mehrfamilienhaus",
  "grundstueck",
  "gewerbe",
  "sonstiges",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  einfamilienhaus: "Einfamilienhaus",
  doppelhaushaelfte: "Doppelhaushälfte",
  reihenhaus: "Reihenhaus",
  eigentumswohnung: "Eigentumswohnung",
  mehrfamilienhaus: "Mehrfamilienhaus",
  grundstueck: "Grundstück",
  gewerbe: "Gewerbe",
  sonstiges: "Sonstiges",
};

/** Nutzung */
export const USAGE_TYPES = ["selbstnutzung", "vermietet", "gemischt"] as const;
export type UsageType = (typeof USAGE_TYPES)[number];

export const USAGE_TYPE_LABELS: Record<UsageType, string> = {
  selbstnutzung: "Selbstnutzung",
  vermietet: "Vermietet",
  gemischt: "Teils selbst genutzt, teils vermietet",
};

/** Dokumenttypen – MVP-Pflicht + vorbereitete Erweiterung */
export const DOCUMENT_TYPES = [
  // MVP-Pflicht (sichere Erkennung)
  "personalausweis",
  "gehaltsabrechnung",
  "grundbuchauszug",
  "expose",
  // Vorbereitet
  "kontoauszug",
  "einkommensteuerbescheid",
  "einkommensteuererklaerung",
  "eigenkapitalnachweis",
  "kaufvertragsentwurf",
  "teilungserklaerung",
  "wohnflaechenberechnung",
  "flurkarte_lageplan",
  "baubeschreibung",
  "baukostenaufstellung",
  "baugenehmigung",
  "darlehensvertrag",
  "restschuldnachweis",
  "mietvertrag",
  "mietaufstellung",
  "bwa",
  "susa",
  "jahresabschluss",
  "euer",
  "rentenbescheid",
  "versicherungsnachweis",
  "sonstige",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  personalausweis: "Personalausweis",
  gehaltsabrechnung: "Gehaltsabrechnung",
  grundbuchauszug: "Grundbuchauszug",
  expose: "Exposé / Objektunterlagen",
  kontoauszug: "Kontoauszug",
  einkommensteuerbescheid: "Einkommensteuerbescheid",
  einkommensteuererklaerung: "Einkommensteuererklärung",
  eigenkapitalnachweis: "Eigenkapitalnachweis",
  kaufvertragsentwurf: "Kaufvertragsentwurf",
  teilungserklaerung: "Teilungserklärung",
  wohnflaechenberechnung: "Wohnflächenberechnung",
  flurkarte_lageplan: "Flurkarte / Lageplan",
  baubeschreibung: "Baubeschreibung",
  baukostenaufstellung: "Baukostenaufstellung",
  baugenehmigung: "Baugenehmigung",
  darlehensvertrag: "Darlehensvertrag",
  restschuldnachweis: "Restschuldnachweis",
  mietvertrag: "Mietvertrag",
  mietaufstellung: "Mietaufstellung",
  bwa: "BWA",
  susa: "Summen- und Saldenliste (SuSa)",
  jahresabschluss: "Jahresabschluss",
  euer: "Einnahmenüberschussrechnung (EÜR)",
  rentenbescheid: "Rentenbescheid",
  versicherungsnachweis: "Versicherungsnachweis",
  sonstige: "Sonstige Unterlagen",
};

/** Uploadquelle eines Dokuments */
export const UPLOAD_SOURCES = ["kunde", "vermittler", "import"] as const;
export type UploadSource = (typeof UPLOAD_SOURCES)[number];

/** Verarbeitungsstatus (OCR / Klassifizierung / Extraktion) */
export const PROCESSING_STATUSES = [
  "ausstehend",
  "laeuft",
  "fertig",
  "fehler",
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

/** Prüfstatus eines Dokuments (durch Vermittler) */
export const DOCUMENT_REVIEW_STATUSES = [
  "offen",
  "akzeptiert",
  "abgelehnt",
  "ersetzt",
  "duplikat",
] as const;
export type DocumentReviewStatus = (typeof DOCUMENT_REVIEW_STATUSES)[number];

export const DOCUMENT_REVIEW_STATUS_LABELS: Record<DocumentReviewStatus, string> = {
  offen: "Prüfbereit",
  akzeptiert: "Akzeptiert",
  abgelehnt: "Abgelehnt",
  ersetzt: "Ersetzt",
  duplikat: "Duplikat",
};

/** Sicherheits-/Scan-Status eines Uploads */
export const DOCUMENT_SCAN_STATUSES = [
  "uploaded",
  "quarantined",
  "virus_scan_pending",
  "virus_scan_clean",
  "virus_scan_failed",
  "rejected",
  "ready_for_ocr",
] as const;
export type DocumentScanStatus = (typeof DOCUMENT_SCAN_STATUSES)[number];

/**
 * Nur diese Status belegen einen abgeschlossenen, sauberen Virenscan. Alles
 * andere (u. a. `virus_scan_failed`, `virus_scan_pending`) wird weder
 * ausgeliefert noch exportiert – bewusst als Allowlist, damit ein neu
 * hinzugefügter Status per Default gesperrt ist (fail-closed).
 */
export const DELIVERABLE_SCAN_STATUSES = ["virus_scan_clean", "ready_for_ocr"] as const;

export function isDeliverableScanStatus(status: string): boolean {
  return (DELIVERABLE_SCAN_STATUSES as readonly string[]).includes(status);
}

/** Schweregrad von Prüfungen / Warnungen */
export const SEVERITIES = ["ok", "warnung", "kritisch", "fehlt"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Pflichtstatus einer Checklisten-Unterlage */
export const REQUIREMENT_LEVELS = [
  "zwingend",
  "spaeter",
  "optional",
  "bankabhaengig",
] as const;
export type RequirementLevel = (typeof REQUIREMENT_LEVELS)[number];

export const REQUIREMENT_LEVEL_LABELS: Record<RequirementLevel, string> = {
  zwingend: "Zwingend erforderlich",
  spaeter: "Später erforderlich",
  optional: "Optional",
  bankabhaengig: "Nur bei bestimmten Banken",
};

/** Bankbezug einer Unterlage */
export const REQUIREMENT_SCOPES = [
  "allgemein",
  "bankbezogen",
  "produktbezogen",
] as const;
export type RequirementScope = (typeof REQUIREMENT_SCOPES)[number];

/** Status einer fallbezogenen Checklisten-Position */
export const CHECKLIST_ITEM_STATUSES = [
  "offen",
  "vorhanden",
  "unvollstaendig",
  "nicht_aktuell",
  "abgelehnt",
  "nicht_erforderlich",
] as const;
export type ChecklistItemStatus = (typeof CHECKLIST_ITEM_STATUSES)[number];

/** Kommunikationskanäle */
export const MESSAGE_CHANNELS = ["email", "whatsapp", "pdf", "intern"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

/** Nachrichten-Vorlagentypen */
export const MESSAGE_TEMPLATE_TYPES = [
  "erstnachforderung",
  "danke_erhalten",
  "datei_nicht_lesbar",
  "datei_veraltet",
  "unterlage_fehlt_weiterhin",
  "pdf_checkliste",
  "interne_notiz",
  "status_eingereicht",
  "status_nachforderung",
  "status_genehmigt",
] as const;
export type MessageTemplateType = (typeof MESSAGE_TEMPLATE_TYPES)[number];

/** SaaS-Tarife */
export const PLAN_TIERS = [
  "starter",
  "pro",
  "team",
  "enterprise",
  "white_label",
] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/** Benutzerrollen (mandantenfähig) */
export const USER_ROLES = [
  "white_label_admin",
  "org_admin",
  "vermittler",
  "teammitglied",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  white_label_admin: "White-Label-Admin",
  org_admin: "Owner / Admin",
  vermittler: "Vermittler",
  teammitglied: "Sachbearbeiter",
};

/** KI-Job-Arten */
export const AI_JOB_TYPES = [
  "classify",
  "extract",
  "summarize",
  "duplicate",
  "scan_quality",
  "assign",
  "analyze_payslip",
  "analyze_land_register",
  "analyze_bank_statements",
  "analyze_property",
  "detect_missing",
  "detect_bank_requirements",
  "generate_message",
  "bank_summary",
  "plausibility",
  "platform_mapping",
] as const;
export type AiJobType = (typeof AI_JOB_TYPES)[number];

export const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "needs_review",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Audit-Aktionen */
export const AUDIT_ACTIONS = [
  "case.created",
  "case.updated",
  "case.status_changed",
  "case.archived",
  "case.deleted",
  "document.uploaded",
  "document.classified",
  "document.reclassified",
  "document.reviewed",
  "document.deleted",
  "ai.evaluated",
  "field.corrected",
  "export.prepared",
  "platform.released",
  "platform.pushed",
  "message.generated",
  "message.sent",
  "upload_link.created",
  "upload_link.accessed",
  "upload_link.deactivated",
  "upload_link.regenerated",
  "document.scanned",
  "document.quarantined",
  "document.rejected",
  "document.downloaded",
  "pdf.generated",
  "auth.login",
  "auth.login_failed",
  "auth.logout",
  "customer.data_exported",
  "customer.deleted",
  "access.viewed",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
