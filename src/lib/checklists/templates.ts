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
  /**
   * Position wird je Antragsteller verlangt (Legitimation, Einkommen), nicht
   * einmal pro Fall. `requiredCount` gilt dann PRO PERSON.
   */
  perApplicant?: boolean;
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
    customerDescription:
      "Bitte laden Sie Vorder- und Rückseite Ihres gültigen Personalausweises hoch – eine Datei mit beiden Seiten reicht.",
    // Bewusst 1 Datei je Person: der Perso kommt praktisch immer als EIN
    // PDF/Foto-Scan mit beiden Seiten. Ob beide Seiten enthalten sind, prüft
    // der Vermittler im Review – zwei Pflicht-Dateien meldeten "unvollständig",
    // obwohl der Ausweis vollständig vorlag (05.08., Fall Colell).
    internalDescription: "Legitimation, Adressabgleich, Gültigkeit prüfen (beide Seiten enthalten?).",
    documentType: "personalausweis",
    requiredCount: 1,
    perApplicant: true,
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
    perApplicant: true,
    example: "Gehaltsabrechnung_Max_Mustermann_2026-05.pdf",
  }),
  estBescheid: item({
    key: "est_bescheid",
    name: "Einkommensteuerbescheid (letzter)",
    customerDescription:
      "Bitte laden Sie Ihren letzten Einkommensteuerbescheid hoch – das Schreiben, das Sie vom Finanzamt nach Abgabe Ihrer Steuererklärung erhalten. Er sollte nicht älter als eineinhalb Jahre sein.",
    documentType: "einkommensteuerbescheid",
    level: "spaeter",
    recencyDays: 540,
    example: "Einkommensteuerbescheid_2024.pdf",
  }),
  eigenkapital: item({
    key: "eigenkapitalnachweis",
    name: "Eigenkapitalnachweis",
    customerDescription:
      "Nachweis über Ihr Eigenkapital (z. B. Kontoauszug, Depotauszug, Bausparvertrag) – bitte nicht älter als 3 Monate und mit gut lesbarem Kontostand.",
    internalDescription: "Herkunft/Verfügbarkeit des Eigenkapitals belegen.",
    documentType: "eigenkapitalnachweis",
    recencyDays: 90,
    example: "Kontoauszug_Tagesgeldkonto_Mai_2026.pdf",
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
    customerDescription:
      "Exposé oder Objektbeschreibung mit Kaufpreis, Wohnfläche und Baujahr. Bitte das vollständige Dokument hochladen, gut lesbar.",
    documentType: "expose",
    example: "Expose_Musterstrasse_12.pdf",
  }),
  kaufvertrag: item({
    key: "kaufvertragsentwurf",
    name: "Kaufvertragsentwurf",
    customerDescription:
      "Bitte laden Sie den Entwurf des Kaufvertrags hoch, den Sie von Notar oder Verkäufer erhalten haben. Ein noch nicht unterschriebener Entwurf reicht zunächst aus.",
    documentType: "kaufvertragsentwurf",
    level: "spaeter",
    example: "Kaufvertragsentwurf_Notar_Mueller.pdf",
  }),
  wohnflaeche: item({
    key: "wohnflaechenberechnung",
    name: "Wohnflächenberechnung",
    customerDescription:
      "Bitte laden Sie die Wohnflächenberechnung hoch, falls vorhanden – damit lässt sich die Wohnfläche der Immobilie genau nachvollziehen. Bitte die vollständige Berechnung hochladen, gut lesbar.",
    documentType: "wohnflaechenberechnung",
    level: "optional",
    example: "Wohnflaechenberechnung_Musterstrasse_12.pdf",
  }),
  flurkarte: item({
    key: "flurkarte_lageplan",
    name: "Flurkarte / Lageplan",
    customerDescription:
      "Bitte laden Sie die Flurkarte oder den Lageplan des Grundstücks hoch, falls vorhanden – die bekommen Sie beim Katasteramt oder von Ihrem Notar. Bitte laden Sie das vollständige Dokument gut lesbar hoch.",
    documentType: "flurkarte_lageplan",
    level: "optional",
    example: "Flurkarte_Musterstrasse_12.pdf",
  }),
  teilung: item({
    key: "teilungserklaerung",
    name: "Teilungserklärung",
    customerDescription:
      "Bitte laden Sie die Teilungserklärung der Eigentumswohnung hoch – das Dokument, das die Aufteilung des Gebäudes in einzelne Wohnungseinheiten regelt. Sie ist meist mehrseitig, bitte alle Seiten und Anlagen mit hochladen.",
    documentType: "teilungserklaerung",
    level: "zwingend",
    example: "Teilungserklaerung_Musterstrasse_12.pdf",
  }),
  baubeschreibung: item({
    key: "baubeschreibung",
    name: "Baubeschreibung",
    customerDescription:
      "Bitte laden Sie die Baubeschreibung hoch, die Sie von Ihrem Bauunternehmen oder Architekten erhalten haben – darin stehen die geplanten Baumaterialien und die Ausstattung. Bitte das vollständige Dokument mit allen Seiten hochladen.",
    documentType: "baubeschreibung",
    example: "Baubeschreibung_Neubau_Musterstrasse.pdf",
  }),
  baukosten: item({
    key: "baukostenaufstellung",
    name: "Baukostenaufstellung",
    customerDescription:
      "Bitte laden Sie die Aufstellung der geplanten Baukosten hoch – zum Beispiel den Kostenvoranschlag Ihres Bauunternehmens oder der beteiligten Handwerker. Bitte die vollständige Aufstellung hochladen, nicht nur einzelne Positionen.",
    documentType: "baukostenaufstellung",
    example: "Baukostenaufstellung_Musterstrasse.pdf",
  }),
  baugenehmigung: item({
    key: "baugenehmigung",
    name: "Baugenehmigung",
    customerDescription:
      "Bitte laden Sie Ihre Baugenehmigung hoch, sobald sie Ihnen von der Bauaufsichtsbehörde vorliegt. Bitte den vollständigen Bescheid mit allen Anlagen hochladen.",
    documentType: "baugenehmigung",
    level: "spaeter",
    example: "Baugenehmigung_Musterstrasse.pdf",
  }),
  restschuld: item({
    key: "restschuldnachweis",
    name: "Restschuldnachweis bestehendes Darlehen",
    customerDescription:
      "Bitte laden Sie einen aktuellen Nachweis über die Restschuld Ihres bestehenden Darlehens hoch – z. B. ein aktueller Kontoauszug des Darlehenskontos, den Sie bei Ihrer Bank bekommen.",
    documentType: "restschuldnachweis",
    example: "Kontoauszug_Darlehenskonto_Musterbank_2026.pdf",
  }),
  darlehensvertrag: item({
    key: "darlehensvertrag",
    name: "Bestehender Darlehensvertrag",
    customerDescription:
      "Bitte laden Sie Ihren bestehenden Darlehensvertrag hoch – die Vertragsunterlagen, die Sie beim Abschluss Ihres aktuellen Darlehens erhalten haben. Bitte alle Seiten hochladen, auch die Darlehensbedingungen im Anhang.",
    documentType: "darlehensvertrag",
    example: "Darlehensvertrag_Musterbank.pdf",
  }),
  mietvertrag: item({
    key: "mietvertrag",
    name: "Mietvertrag / Mietnachweis",
    customerDescription:
      "Bitte laden Sie den Mietvertrag für die vermietete Immobilie hoch – alle Seiten, inklusive eventueller Nachträge.",
    documentType: "mietvertrag",
    example: "Mietvertrag_Musterstrasse_12.pdf",
  }),
  mietaufstellung: item({
    key: "mietaufstellung",
    name: "Mietaufstellung",
    customerDescription:
      "Bitte laden Sie eine Aufstellung der Mieteinnahmen hoch – zum Beispiel eine Übersicht aller vermieteten Einheiten mit der jeweiligen Kaltmiete. Bitte die Aufstellung vollständig und möglichst aktuell hochladen.",
    documentType: "mietaufstellung",
    example: "Mietaufstellung_Musterstrasse_12.pdf",
  }),
  bwa: item({
    key: "bwa",
    name: "Aktuelle BWA",
    customerDescription:
      "Bitte laden Sie Ihre aktuelle betriebswirtschaftliche Auswertung (BWA) hoch. Die bekommen Sie von Ihrem Steuerberater oder aus Ihrer Buchhaltungssoftware – sie sollte nicht älter als 4 Monate sein.",
    documentType: "bwa",
    recencyDays: 120,
    example: "BWA_Januar_bis_April_2026.pdf",
  }),
  susa: item({
    key: "susa",
    name: "Summen- und Saldenliste (SuSa)",
    customerDescription:
      "Bitte laden Sie Ihre aktuelle Summen- und Saldenliste (SuSa) hoch. Die bekommen Sie wie die BWA von Ihrem Steuerberater oder aus Ihrer Buchhaltungssoftware. Bitte das vollständige Dokument mit allen Seiten hochladen.",
    documentType: "susa",
    example: "Summen_und_Saldenliste_2026.pdf",
  }),
  jahresabschluss: item({
    key: "jahresabschluss",
    name: "Jahresabschlüsse (letzte 2 Jahre)",
    customerDescription:
      "Bitte laden Sie Ihre Jahresabschlüsse der letzten zwei Geschäftsjahre hoch – jeweils Bilanz und Gewinn- und Verlustrechnung, so wie Sie sie von Ihrem Steuerberater erhalten haben. Bitte pro Jahr das vollständige Dokument mit allen Seiten hochladen.",
    documentType: "jahresabschluss",
    requiredCount: 2,
    example: "Jahresabschluss_2024.pdf",
  }),
  euer: item({
    key: "euer",
    name: "EÜR (letzte 2 Jahre)",
    customerDescription:
      "Bitte laden Sie Ihre Einnahmenüberschussrechnung (EÜR) der letzten zwei Jahre hoch. Die erstellt in der Regel Ihr Steuerberater. Bitte jeweils die vollständige Berechnung mit allen Seiten hochladen.",
    documentType: "euer",
    requiredCount: 2,
    example: "Einnahmenueberschussrechnung_2024.pdf",
  }),
  estErklaerung: item({
    key: "est_erklaerung",
    name: "Einkommensteuererklärung",
    customerDescription:
      "Bitte laden Sie Ihre komplette Einkommensteuererklärung hoch, so wie Sie sie beim Finanzamt eingereicht haben – bitte alle Anlagen und Seiten.",
    documentType: "einkommensteuererklaerung",
    level: "spaeter",
    example: "Einkommensteuererklaerung_2024_mit_Anlagen.pdf",
  }),
  rentenbescheid: item({
    key: "rentenbescheid",
    name: "Rentenbescheid",
    customerDescription:
      "Bitte laden Sie Ihren aktuellen Rentenbescheid hoch – das Schreiben Ihres Rentenversicherungsträgers mit der Höhe Ihrer monatlichen Rente. Bitte alle Seiten hochladen, auch eventuelle Anlagen zu Rentenanpassungen.",
    documentType: "rentenbescheid",
    example: "Rentenbescheid_2026.pdf",
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
