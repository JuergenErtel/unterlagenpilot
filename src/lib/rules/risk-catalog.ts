import type { Platform } from "@/lib/domain/enums";

/**
 * Strukturierter KO-/Risiko-/Warnungs-Katalog für die Baufinanzierung.
 *
 * Trennt strikt zwischen INTERNER Sicht (Vermittler: KO-Kriterien, Risiken) und
 * KUNDENSICHT (nur freundliche, nicht-wertende Hinweise). `customerVisible=false`
 * bedeutet: erscheint NIE in der Kundensicht/Upload-Seite.
 *
 * Bewusst datengetrieben, damit die Plausibilitäts-/Prüf-Engine und die
 * Dokumenterkennung dieselben Codes referenzieren können.
 */

export const RISK_SEVERITIES = ["info", "warnung", "kritisch", "blocker"] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export const RISK_SEVERITY_LABELS: Record<RiskSeverity, string> = {
  info: "Hinweis",
  warnung: "Warnung",
  kritisch: "Kritisch",
  blocker: "KO-Kriterium",
};

export const RISK_CATEGORIES = [
  "einkommen",
  "beschaeftigung",
  "konto",
  "eigenkapital",
  "objekt",
  "grundbuch",
  "selbststaendigkeit",
  "kapitalanlage",
  "neubau",
  "dokumentenqualitaet",
  "plattformvollstaendigkeit",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  einkommen: "Einkommen",
  beschaeftigung: "Beschäftigung",
  konto: "Konto",
  eigenkapital: "Eigenkapital",
  objekt: "Objekt",
  grundbuch: "Grundbuch",
  selbststaendigkeit: "Selbstständigkeit",
  kapitalanlage: "Kapitalanlage",
  neubau: "Neubau",
  dokumentenqualitaet: "Dokumentenqualität",
  plattformvollstaendigkeit: "Plattformvollständigkeit",
};

export interface RiskRule {
  code: string;
  category: RiskCategory;
  title: string;
  /** Interne Erläuterung für den Vermittler (nie an den Kunden). */
  internalDescription: string;
  /** Optionaler, freundlicher Text für die Kundensicht. */
  customerText?: string;
  severity: RiskSeverity;
  customerVisible: boolean;
  /** Auf welchen Plattformen ist der Befund besonders relevant. */
  platforms: Platform[];
  recommendedAction: string;
}

const ALL: Platform[] = ["europace", "finlink", "ehyp_home"];

export const RISK_CATALOG: RiskRule[] = [
  // ---- Beschäftigung / Einkommen ----
  {
    code: "EMP_AUSTRITT_ERKANNT",
    category: "beschaeftigung",
    title: "Austrittsdatum erkannt",
    internalDescription: "In den Unterlagen ist ein Austritts-/Befristungsdatum erkennbar. Beschäftigungssicherheit prüfen.",
    severity: "kritisch",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Aktuellen, unbefristeten Beschäftigungsnachweis oder Folgevertrag anfordern.",
  },
  {
    code: "EMP_PROBEZEIT",
    category: "beschaeftigung",
    title: "Probezeit erkannt",
    internalDescription: "Beschäftigung in Probezeit – viele Banken verlangen Ende der Probezeit.",
    severity: "warnung",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Bankpolitik prüfen; ggf. Bestätigung über Festanstellung nach Probezeit einholen.",
  },
  {
    code: "EMP_BEFRISTET",
    category: "beschaeftigung",
    title: "Befristeter Vertrag",
    internalDescription: "Arbeitsvertrag befristet – Auswirkungen auf Tragfähigkeit/Bankauswahl.",
    severity: "warnung",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Restlaufzeit dokumentieren, Banken mit Akzeptanz befristeter Verträge wählen.",
  },
  {
    code: "INC_STEUERKLASSE_FAMILIENSTAND",
    category: "einkommen",
    title: "Steuerklasse passt nicht zum Familienstand",
    internalDescription: "Steuerklasse aus Gehaltsabrechnung widerspricht dem angegebenen Familienstand.",
    severity: "warnung",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Angaben mit Kunde klären; Steuerklasse/Familienstand abgleichen.",
  },
  {
    code: "INC_KINDER_WIDERSPRUCH",
    category: "einkommen",
    title: "Kinderangaben widersprüchlich",
    internalDescription: "Anzahl Kinder in Formular und Unterlagen weicht ab (z. B. Kinderfreibeträge).",
    severity: "info",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Haushaltszusammensetzung mit Kunde bestätigen.",
  },

  // ---- Konto ----
  {
    code: "ACC_RUECKLASTSCHRIFT",
    category: "konto",
    title: "Rücklastschrift im Kontoauszug",
    internalDescription: "Rücklastschrift(en) erkannt – Hinweis auf mögliche Liquiditätsengpässe.",
    severity: "warnung",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Hintergrund klären; ggf. weitere Kontoauszüge zur Einordnung anfordern.",
  },
  {
    code: "ACC_PFAENDUNG_INKASSO",
    category: "konto",
    title: "Pfändung / Inkasso-Hinweis im Konto",
    internalDescription: "Pfändung oder Inkasso-Buchung erkennbar – i. d. R. KO für viele Banken.",
    severity: "blocker",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Sachverhalt aufklären; Tragfähigkeit und Bankfähigkeit grundsätzlich prüfen.",
  },

  // ---- Eigenkapital ----
  {
    code: "EK_NICHT_BELEGT",
    category: "eigenkapital",
    title: "Eigenkapital nicht belegt",
    internalDescription: "Angegebenes Eigenkapital ist (noch) nicht durch Nachweise belegt.",
    customerText: "Bitte einen aktuellen Nachweis über Ihr Eigenkapital hochladen (z. B. Kontoauszug, Depotauszug).",
    severity: "kritisch",
    customerVisible: true,
    platforms: ALL,
    recommendedAction: "Eigenkapitalnachweis(e) anfordern, Summe mit Finanzierungsbedarf abgleichen.",
  },

  // ---- Objekt / Grundbuch ----
  {
    code: "OBJ_KAUFPREIS_FEHLT",
    category: "objekt",
    title: "Kaufpreis fehlt",
    internalDescription: "Kaufpreis nicht erfasst – Pflichtfeld für Plattform-Einreichung.",
    severity: "kritisch",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Kaufpreis aus Kaufvertrag/Exposé übernehmen.",
  },
  {
    code: "OBJ_WOHNFLAECHE_FEHLT",
    category: "objekt",
    title: "Wohnfläche fehlt",
    internalDescription: "Wohnfläche nicht erfasst – relevant für Beleihungswert.",
    severity: "warnung",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Wohnflächenberechnung/Exposé heranziehen.",
  },
  {
    code: "OBJ_GRUNDSTUECK_FEHLT",
    category: "objekt",
    title: "Grundstücksgröße fehlt",
    internalDescription: "Grundstücksgröße nicht erfasst – relevant bei Häusern/Neubau.",
    severity: "info",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Flurkarte/Grundbuch/Exposé prüfen.",
  },
  {
    code: "GB_BELASTUNG_ABT2",
    category: "grundbuch",
    title: "Belastung Abteilung II (Grundbuch)",
    internalDescription: "Lasten/Beschränkungen in Abteilung II (z. B. Wegerechte, Nießbrauch).",
    severity: "warnung",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Art der Belastung bewerten; Auswirkung auf Beleihung mit Bank klären.",
  },
  {
    code: "GB_GRUNDSCHULD_ABT3",
    category: "grundbuch",
    title: "Bestehende Grundschuld Abteilung III",
    internalDescription: "Bestehende Grundschuld(en) in Abteilung III – Ablösung/Rangfolge prüfen.",
    severity: "warnung",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Ablösebetrag und Rang klären; Löschungsbewilligung ggf. anfordern.",
  },

  // ---- Selbstständigkeit ----
  {
    code: "SELF_BWA_FEHLT",
    category: "selbststaendigkeit",
    title: "BWA fehlt",
    internalDescription: "Bei Selbstständigen fehlt die aktuelle BWA.",
    customerText: "Bitte Ihre aktuelle BWA hochladen.",
    severity: "kritisch",
    customerVisible: true,
    platforms: ALL,
    recommendedAction: "Aktuelle BWA (und ggf. SuSa) anfordern.",
  },
  {
    code: "SELF_STEUERBESCHEID_FEHLT",
    category: "selbststaendigkeit",
    title: "Steuerbescheid fehlt",
    internalDescription: "Einkommensteuerbescheid(e) für die Einkommensbeurteilung fehlen.",
    customerText: "Bitte Ihre letzten Einkommensteuerbescheide hochladen.",
    severity: "kritisch",
    customerVisible: true,
    platforms: ALL,
    recommendedAction: "Steuerbescheide der letzten 2 Jahre anfordern.",
  },

  // ---- Neubau ----
  {
    code: "NEU_BAUKOSTEN_FEHLT",
    category: "neubau",
    title: "Neubau ohne Baukostenaufstellung",
    internalDescription: "Bei Neubau fehlt die Baukostenaufstellung – Pflicht für Gesamtkostenermittlung.",
    customerText: "Bitte die Baukostenaufstellung Ihres Bauvorhabens hochladen.",
    severity: "kritisch",
    customerVisible: true,
    platforms: ALL,
    recommendedAction: "Baukostenaufstellung und Baubeschreibung anfordern.",
  },

  // ---- Kapitalanlage ----
  {
    code: "KAP_MIETNACHWEIS_FEHLT",
    category: "kapitalanlage",
    title: "Kapitalanlage ohne Mietvertrag/Mietaufstellung",
    internalDescription: "Bei vermieteten Objekten fehlt der Miet-/Mietaufstellungsnachweis.",
    customerText: "Bitte den aktuellen Mietvertrag bzw. eine Mietaufstellung hochladen.",
    severity: "warnung",
    customerVisible: true,
    platforms: ALL,
    recommendedAction: "Mietvertrag/Mietaufstellung anfordern; Mieteinnahmen plausibilisieren.",
  },

  // ---- Dokumentenqualität ----
  {
    code: "DOC_UNLESBAR",
    category: "dokumentenqualitaet",
    title: "Dokument unlesbar",
    internalDescription: "Datei ist nicht lesbar (Qualität/Scan). OCR/Prüfung nicht möglich.",
    customerText: "Eine Datei konnte leider nicht gelesen werden. Bitte laden Sie sie erneut hoch (gut lesbar, vollständig).",
    severity: "warnung",
    customerVisible: true,
    platforms: ALL,
    recommendedAction: "Erneuten, gut lesbaren Upload anfordern.",
  },
  {
    code: "DOC_VERALTET",
    category: "dokumentenqualitaet",
    title: "Dokument veraltet",
    internalDescription: "Dokument überschreitet die Aktualitätsanforderung (z. B. >90 Tage).",
    customerText: "Eine Unterlage ist nicht mehr aktuell. Bitte laden Sie die aktuelle Version hoch.",
    severity: "warnung",
    customerVisible: true,
    platforms: ALL,
    recommendedAction: "Aktuelle Version anfordern.",
  },

  // ---- Plattformvollständigkeit ----
  {
    code: "PLT_PFLICHTFELD_FEHLT",
    category: "plattformvollstaendigkeit",
    title: "Pflichtfeld für Plattform fehlt",
    internalDescription: "Mindestens ein Plattform-Pflichtfeld ist leer – Einreichung noch nicht möglich.",
    severity: "kritisch",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Fehlende Pflichtfelder ergänzen (siehe Export-Ansicht).",
  },
  {
    code: "PLT_DOKUMENT_NICHT_FREIGEGEBEN",
    category: "plattformvollstaendigkeit",
    title: "Dokument nicht freigegeben",
    internalDescription: "Relevante Dokumente sind noch nicht manuell geprüft/freigegeben.",
    severity: "info",
    customerVisible: false,
    platforms: ALL,
    recommendedAction: "Dokumente im Review-Center prüfen und freigeben.",
  },
];

export function getRiskRule(code: string): RiskRule | undefined {
  return RISK_CATALOG.find((r) => r.code === code);
}

export function risksByCategory(category: RiskCategory): RiskRule[] {
  return RISK_CATALOG.filter((r) => r.category === category);
}

/** Nur kundensichtbare Hinweise (für Kundensicht/Upload-Seite). */
export function customerVisibleRisks(): RiskRule[] {
  return RISK_CATALOG.filter((r) => r.customerVisible);
}
