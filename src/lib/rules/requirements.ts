import type {
  DocumentType,
  EmploymentType,
  FinancingType,
  Platform,
  PropertyType,
  RequirementLevel,
} from "@/lib/domain/enums";

/**
 * Rules Engine für Anforderungen. Mehrere Ebenen, die kombiniert ausgewertet
 * werden. Im MVP als deklarative Datensätze; später pro Organisation editierbar.
 *
 *  - GlobalRequirementRules      (immer)
 *  - PlatformRequirementRules    (Europace/FinLink/eHyp home)
 *  - BankRequirementRules        (bankindividuell)
 *  - CaseTypeRequirementRules    (Finanzierungsart)
 *  - ApplicantTypeRequirementRules (Beschäftigungs-/Kundentyp)
 *  - PropertyTypeRequirementRules  (Objektart)
 */

export interface RequirementRule {
  key: string;
  title: string;
  documentType: DocumentType | null;
  level: RequirementLevel;
  source:
    | "global"
    | "platform"
    | "bank"
    | "caseType"
    | "applicantType"
    | "propertyType";
  platform?: Platform | "allgemein";
  bank?: string;
}

export interface RuleContext {
  financingType?: FinancingType;
  employmentType?: EmploymentType;
  propertyType?: PropertyType;
  platforms?: Platform[];
  bankName?: string;
}

export const GlobalRequirementRules: RequirementRule[] = [
  { key: "personalausweis", title: "Personalausweis (beidseitig)", documentType: "personalausweis", level: "zwingend", source: "global", platform: "allgemein" },
];

export const PlatformRequirementRules: Record<Platform, RequirementRule[]> = {
  europace: [
    { key: "europace.selbstauskunft", title: "Selbstauskunft (Europace-Vorgang)", documentType: null, level: "zwingend", source: "platform", platform: "europace" },
    { key: "europace.einkommensnachweis", title: "Einkommensnachweis (Europace)", documentType: "gehaltsabrechnung", level: "zwingend", source: "platform", platform: "europace" },
  ],
  finlink: [
    { key: "finlink.haushaltsrechnung", title: "Vollständige Haushaltsdaten (FinLink)", documentType: null, level: "zwingend", source: "platform", platform: "finlink" },
  ],
  ehyp_home: [
    { key: "ehyp.objektnachweis", title: "Objektnachweis (eHyp home)", documentType: "expose", level: "zwingend", source: "platform", platform: "ehyp_home" },
    { key: "ehyp.grundbuch", title: "Grundbuchauszug (eHyp home)", documentType: "grundbuchauszug", level: "zwingend", source: "platform", platform: "ehyp_home" },
  ],
};

export const CaseTypeRequirementRules: Partial<Record<FinancingType, RequirementRule[]>> = {
  neubau: [
    { key: "case.baubeschreibung", title: "Baubeschreibung", documentType: "baubeschreibung", level: "zwingend", source: "caseType" },
    { key: "case.baukosten", title: "Baukostenaufstellung", documentType: "baukostenaufstellung", level: "zwingend", source: "caseType" },
  ],
  anschlussfinanzierung: [
    { key: "case.restschuld", title: "Restschuldnachweis", documentType: "restschuldnachweis", level: "zwingend", source: "caseType" },
  ],
};

export const ApplicantTypeRequirementRules: Partial<Record<EmploymentType, RequirementRule[]>> = {
  selbststaendiger: [
    { key: "appl.bwa", title: "Aktuelle BWA", documentType: "bwa", level: "zwingend", source: "applicantType" },
    { key: "appl.jahresabschluss", title: "Jahresabschlüsse (2 Jahre)", documentType: "jahresabschluss", level: "zwingend", source: "applicantType" },
    { key: "appl.est", title: "Einkommensteuerbescheide (2 Jahre)", documentType: "einkommensteuerbescheid", level: "zwingend", source: "applicantType" },
  ],
  geschaeftsfuehrer: [
    { key: "appl.gf.jahresabschluss", title: "Jahresabschluss der Gesellschaft", documentType: "jahresabschluss", level: "zwingend", source: "applicantType" },
  ],
  rentner: [
    { key: "appl.rente", title: "Rentenbescheid", documentType: "rentenbescheid", level: "zwingend", source: "applicantType" },
  ],
};

export const PropertyTypeRequirementRules: Partial<Record<PropertyType, RequirementRule[]>> = {
  eigentumswohnung: [
    { key: "prop.teilung", title: "Teilungserklärung", documentType: "teilungserklaerung", level: "zwingend", source: "propertyType" },
  ],
  mehrfamilienhaus: [
    { key: "prop.mietaufstellung", title: "Mietaufstellung", documentType: "mietaufstellung", level: "zwingend", source: "propertyType" },
  ],
};

/** Beispielhafte bankindividuelle Anforderungen (später konfigurierbar). */
export const BankRequirementRules: Record<string, RequirementRule[]> = {
  "Muster Bank AG": [
    { key: "bank.muster.kontoauszug", title: "Kontoauszüge 3 Monate", documentType: "kontoauszug", level: "bankabhaengig", source: "bank", bank: "Muster Bank AG" },
  ],
};

/** Wertet alle Ebenen aus und liefert die deduplizierten Anforderungen. */
export function evaluateRequirements(ctx: RuleContext): RequirementRule[] {
  const rules: RequirementRule[] = [...GlobalRequirementRules];

  for (const p of ctx.platforms ?? []) rules.push(...PlatformRequirementRules[p]);
  if (ctx.financingType) rules.push(...(CaseTypeRequirementRules[ctx.financingType] ?? []));
  if (ctx.employmentType) rules.push(...(ApplicantTypeRequirementRules[ctx.employmentType] ?? []));
  if (ctx.propertyType) rules.push(...(PropertyTypeRequirementRules[ctx.propertyType] ?? []));
  if (ctx.bankName) rules.push(...(BankRequirementRules[ctx.bankName] ?? []));

  // Dedupe nach key (strengstes Level gewinnt)
  const map = new Map<string, RequirementRule>();
  for (const r of rules) {
    const ex = map.get(r.key);
    if (!ex || levelRank(r.level) > levelRank(ex.level)) map.set(r.key, r);
  }
  return [...map.values()];
}

function levelRank(l: RequirementLevel): number {
  return l === "zwingend" ? 4 : l === "bankabhaengig" ? 3 : l === "spaeter" ? 2 : 1;
}
