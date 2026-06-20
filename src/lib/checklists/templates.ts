import type {
  DocumentType,
  Platform,
  RequirementLevel,
  RequirementScope,
} from "@/lib/domain/enums";

/**
 * Fixe Checklisten für den MVP – strukturiert so, dass sie später editierbar
 * werden (Organisation/White-Label). Jede Unterlage trägt Pflichtstatus,
 * Plattform-/Bankbezug, Aktualitätsanforderung, Dateitypen und Beispiel.
 */

export interface ChecklistItemDef {
  key: string;
  name: string;
  customerDescription: string;
  internalDescription?: string;
  documentType: DocumentType | null;
  level: RequirementLevel;
  scope: RequirementScope;
  platforms: Platform[];
  bankSpecific?: boolean;
  recencyDays?: number;
  acceptedFileTypes?: string[];
  requiredCount?: number;
  example?: string;
}

export interface ChecklistTemplateDef {
  key: string;
  name: string;
  description: string;
  items: ChecklistItemDef[];
}

const ALL: Platform[] = ["europace", "finlink", "ehyp_home"];

// ---- Wiederverwendbare Bausteine ----
const item = (
  o: Partial<ChecklistItemDef> & Pick<ChecklistItemDef, "key" | "name" | "documentType">
): ChecklistItemDef => ({
  customerDescription: o.customerDescription ?? o.name,
  level: o.level ?? "zwingend",
  scope: o.scope ?? "allgemein",
  platforms: o.platforms ?? ALL,
  acceptedFileTypes: o.acceptedFileTypes ?? ["pdf", "jpg", "png"],
  requiredCount: o.requiredCount ?? 1,
  ...o,
});

// Häufig genutzte Einzelpositionen
const I = {
  ausweis: item({
    key: "personalausweis",
    name: "Personalausweis (Vorder- und Rückseite)",
    customerDescription: "Bitte laden Sie Vorder- und Rückseite Ihres gültigen Personalausweises hoch.",
    internalDescription: "Legitimation, Adressabgleich, Gültigkeit prüfen.",
    documentType: "personalausweis",
    requiredCount: 2,
    example: "Personalausweis_Max_Mustermann.pdf",
  }),
  gehalt: item({
    key: "gehaltsabrechnung",
    name: "Gehaltsabrechnungen (letzte 3 Monate)",
    customerDescription: "Bitte laden Sie Ihre letzten drei Gehaltsabrechnungen hoch (aktuelle Version).",
    internalDescription: "Netto/Brutto, Steuerklasse, Eintritt, Austritt, Pfändung, Sonderzahlungen.",
    documentType: "gehaltsabrechnung",
    requiredCount: 3,
    recencyDays: 120,
    example: "Gehaltsabrechnung_Max_Mustermann_2026-05.pdf",
  }),
  estBescheid: item({
    key: "est_bescheid",
    name: "Einkommensteuerbescheid (letzter)",
    documentType: "einkommensteuerbescheid",
    level: "spaeter",
    recencyDays: 540,
  }),
  eigenkapital: item({
    key: "eigenkapitalnachweis",
    name: "Eigenkapitalnachweis",
    customerDescription: "Nachweis über Ihr Eigenkapital (z. B. Kontoauszug, Depotauszug, Bausparvertrag).",
    internalDescription: "Herkunft/Verfügbarkeit des Eigenkapitals belegen.",
    documentType: "eigenkapitalnachweis",
    recencyDays: 90,
  }),
  kontoauszug: item({
    key: "kontoauszug",
    name: "Kontoauszüge (letzte 1–3 Monate)",
    documentType: "kontoauszug",
    level: "bankabhaengig",
    scope: "bankbezogen",
    bankSpecific: true,
    recencyDays: 90,
    requiredCount: 3,
  }),
  grundbuch: item({
    key: "grundbuchauszug",
    name: "Aktueller Grundbuchauszug",
    customerDescription: "Aktueller Grundbuchauszug des Objekts (nicht älter als 6 Monate).",
    internalDescription: "Eigentümer, Abt. II/III, bestehende Belastungen.",
    documentType: "grundbuchauszug",
    recencyDays: 180,
    example: "Grundbuch_Musterstrasse_12_Woerth.pdf",
  }),
  expose: item({
    key: "expose",
    name: "Exposé / Objektunterlagen",
    customerDescription: "Exposé oder Objektbeschreibung mit Kaufpreis, Wohnfläche und Baujahr.",
    documentType: "expose",
    example: "Expose_Musterstrasse_12.pdf",
  }),
  kaufvertrag: item({
    key: "kaufvertragsentwurf",
    name: "Kaufvertragsentwurf",
    documentType: "kaufvertragsentwurf",
    level: "spaeter",
  }),
  wohnflaeche: item({
    key: "wohnflaechenberechnung",
    name: "Wohnflächenberechnung",
    documentType: "wohnflaechenberechnung",
    level: "optional",
  }),
  flurkarte: item({
    key: "flurkarte_lageplan",
    name: "Flurkarte / Lageplan",
    documentType: "flurkarte_lageplan",
    level: "optional",
  }),
  teilung: item({
    key: "teilungserklaerung",
    name: "Teilungserklärung",
    documentType: "teilungserklaerung",
    level: "zwingend",
  }),
  baubeschreibung: item({
    key: "baubeschreibung",
    name: "Baubeschreibung",
    documentType: "baubeschreibung",
  }),
  baukosten: item({
    key: "baukostenaufstellung",
    name: "Baukostenaufstellung",
    documentType: "baukostenaufstellung",
  }),
  baugenehmigung: item({
    key: "baugenehmigung",
    name: "Baugenehmigung",
    documentType: "baugenehmigung",
    level: "spaeter",
  }),
  restschuld: item({
    key: "restschuldnachweis",
    name: "Restschuldnachweis bestehendes Darlehen",
    documentType: "restschuldnachweis",
  }),
  darlehensvertrag: item({
    key: "darlehensvertrag",
    name: "Bestehender Darlehensvertrag",
    documentType: "darlehensvertrag",
  }),
  mietvertrag: item({
    key: "mietvertrag",
    name: "Mietvertrag / Mietnachweis",
    documentType: "mietvertrag",
  }),
  mietaufstellung: item({
    key: "mietaufstellung",
    name: "Mietaufstellung",
    documentType: "mietaufstellung",
  }),
  bwa: item({
    key: "bwa",
    name: "Aktuelle BWA",
    documentType: "bwa",
    recencyDays: 120,
  }),
  susa: item({ key: "susa", name: "Summen- und Saldenliste (SuSa)", documentType: "susa" }),
  jahresabschluss: item({
    key: "jahresabschluss",
    name: "Jahresabschlüsse (letzte 2 Jahre)",
    documentType: "jahresabschluss",
    requiredCount: 2,
  }),
  euer: item({ key: "euer", name: "EÜR (letzte 2 Jahre)", documentType: "euer", requiredCount: 2 }),
  estErklaerung: item({
    key: "est_erklaerung",
    name: "Einkommensteuererklärung",
    documentType: "einkommensteuererklaerung",
    level: "spaeter",
  }),
  rentenbescheid: item({
    key: "rentenbescheid",
    name: "Rentenbescheid",
    documentType: "rentenbescheid",
  }),
};

// ---- Die 16 fixen Checklisten ----
export const CHECKLIST_TEMPLATES: ChecklistTemplateDef[] = [
  {
    key: "angestellter_kauf",
    name: "Angestellter + Kauf",
    description: "Standard-Kauf durch angestellte Antragsteller.",
    items: [I.ausweis, I.gehalt, I.estBescheid, I.eigenkapital, I.grundbuch, I.expose, I.kaufvertrag],
  },
  {
    key: "selbststaendiger_kauf",
    name: "Selbstständiger + Kauf",
    description: "Kauf durch selbstständige/freiberufliche Antragsteller.",
    items: [I.ausweis, I.estBescheid, I.estErklaerung, I.bwa, I.susa, I.jahresabschluss, I.euer, I.eigenkapital, I.grundbuch, I.expose],
  },
  {
    key: "neubau",
    name: "Neubau",
    description: "Neubauvorhaben.",
    items: [I.ausweis, I.gehalt, I.eigenkapital, I.grundbuch, I.baubeschreibung, I.baukosten, I.baugenehmigung, I.flurkarte],
  },
  {
    key: "anschlussfinanzierung",
    name: "Anschlussfinanzierung",
    description: "Ablösung/Prolongation bestehender Finanzierung.",
    items: [I.ausweis, I.gehalt, I.grundbuch, I.restschuld, I.darlehensvertrag],
  },
  {
    key: "kapitalanlage",
    name: "Kapitalanlage",
    description: "Vermietete Immobilie als Kapitalanlage.",
    items: [I.ausweis, I.gehalt, I.eigenkapital, I.grundbuch, I.expose, I.mietvertrag, I.mietaufstellung],
  },
  {
    key: "modernisierung",
    name: "Modernisierung",
    description: "Modernisierungs-/Renovierungsfinanzierung.",
    items: [I.ausweis, I.gehalt, I.grundbuch, I.baukosten, I.eigenkapital],
  },
  {
    key: "umschuldung",
    name: "Umschuldung",
    description: "Umschuldung bestehender Verbindlichkeiten.",
    items: [I.ausweis, I.gehalt, I.grundbuch, I.restschuld, I.darlehensvertrag],
  },
  {
    key: "beamter",
    name: "Beamter",
    description: "Beamtenverhältnis.",
    items: [I.ausweis, I.gehalt, I.eigenkapital, I.grundbuch, I.expose],
  },
  {
    key: "rentner",
    name: "Rentner",
    description: "Rentenbezug.",
    items: [I.ausweis, I.rentenbescheid, I.eigenkapital, I.grundbuch, I.expose],
  },
  {
    key: "gf_gesellschafter",
    name: "Geschäftsführer / Gesellschafter",
    description: "GGF/Gesellschafter mit Beteiligung.",
    items: [I.ausweis, I.gehalt, I.estBescheid, I.jahresabschluss, I.bwa, I.eigenkapital, I.grundbuch, I.expose],
  },
  {
    key: "mehrere_antragsteller",
    name: "Mehrere Antragsteller",
    description: "Zusatz für jeden weiteren Antragsteller (Legitimation & Einkommen).",
    items: [I.ausweis, I.gehalt],
  },
  {
    key: "eigentumswohnung",
    name: "Eigentumswohnung",
    description: "Objektzusatz ETW.",
    items: [I.teilung, I.wohnflaeche, I.grundbuch, I.expose],
  },
  {
    key: "einfamilienhaus",
    name: "Einfamilienhaus",
    description: "Objektzusatz EFH.",
    items: [I.grundbuch, I.expose, I.wohnflaeche, I.flurkarte],
  },
  {
    key: "mehrfamilienhaus",
    name: "Mehrfamilienhaus",
    description: "Objektzusatz MFH.",
    items: [I.grundbuch, I.expose, I.mietaufstellung, I.wohnflaeche, I.flurkarte],
  },
  {
    key: "grundstueck",
    name: "Grundstück",
    description: "Objektzusatz unbebautes Grundstück.",
    items: [I.grundbuch, I.flurkarte],
  },
  {
    key: "vermietete_immobilie",
    name: "Vermietete Immobilie",
    description: "Objektzusatz vermietet.",
    items: [I.mietvertrag, I.mietaufstellung, I.grundbuch, I.expose],
  },
  {
    key: "gemischt_privat_vermietet",
    name: "Gemischt privat/vermietet",
    description: "Objektzusatz gemischte Nutzung.",
    items: [I.mietvertrag, I.mietaufstellung, I.wohnflaeche, I.grundbuch, I.expose],
  },
];

export function getTemplateByKey(key: string): ChecklistTemplateDef | undefined {
  return CHECKLIST_TEMPLATES.find((t) => t.key === key);
}
