import type {
  DocumentType,
  EmploymentType,
  FinancingType,
  Platform,
  PropertyType,
  RequirementLevel,
  UsageType,
} from "@/lib/domain/enums";
import {
  CHECKLIST_TEMPLATES,
  type ChecklistItemDef,
} from "./templates";

export interface CaseChecklistInput {
  financingType?: FinancingType;
  employmentType?: EmploymentType;
  propertyType?: PropertyType;
  usage?: UsageType;
  kapitalanlage?: boolean;
  applicantCount?: number;
}

export interface ResolvedChecklistItem extends ChecklistItemDef {
  /** Status wird gegen vorhandene Dokumente bestimmt. */
  status:
    | "offen"
    | "vorhanden"
    | "unvollstaendig"
    | "nicht_aktuell"
    | "abgelehnt"
    | "nicht_erforderlich";
  matchedDocuments: number;
  customerVisible: boolean;
}

/** Wählt die relevanten Template-Keys für einen Fall. */
export function selectTemplateKeys(input: CaseChecklistInput): string[] {
  const keys = new Set<string>();

  // Beschäftigungs-/Kundentyp + Finanzierungsart
  switch (input.employmentType) {
    case "selbststaendiger":
      keys.add("selbststaendiger_kauf");
      break;
    case "beamter":
      keys.add("beamter");
      break;
    case "rentner":
      keys.add("rentner");
      break;
    case "geschaeftsfuehrer":
    case "gesellschafter":
      keys.add("gf_gesellschafter");
      break;
    default:
      keys.add("angestellter_kauf");
  }

  switch (input.financingType) {
    case "neubau":
      keys.add("neubau");
      break;
    case "anschlussfinanzierung":
      keys.add("anschlussfinanzierung");
      break;
    case "umschuldung":
      keys.add("umschuldung");
      break;
    case "modernisierung":
      keys.add("modernisierung");
      break;
    default:
      break;
  }

  if (input.kapitalanlage) keys.add("kapitalanlage");

  // Objektart
  switch (input.propertyType) {
    case "eigentumswohnung":
      keys.add("eigentumswohnung");
      break;
    case "einfamilienhaus":
    case "doppelhaushaelfte":
    case "reihenhaus":
      keys.add("einfamilienhaus");
      break;
    case "mehrfamilienhaus":
      keys.add("mehrfamilienhaus");
      break;
    case "grundstueck":
      keys.add("grundstueck");
      break;
    default:
      break;
  }

  // Nutzung
  if (input.usage === "vermietet") keys.add("vermietete_immobilie");
  if (input.usage === "gemischt") keys.add("gemischt_privat_vermietet");

  // Mehrere Antragsteller
  if ((input.applicantCount ?? 1) > 1) keys.add("mehrere_antragsteller");

  return [...keys];
}

export interface ExistingDocument {
  documentType: DocumentType | null;
  reviewStatus: string; // offen|akzeptiert|abgelehnt|ersetzt|duplikat
  readable?: boolean | null;
  ageDays?: number | null; // Alter des Dokumentinhalts (z.B. Abrechnungsmonat)
}

/**
 * Baut die fallbezogene Checkliste: kombiniert Templates, dedupliziert nach key,
 * und bestimmt den Status je Position anhand vorhandener Dokumente.
 */
export function buildChecklistForCase(
  input: CaseChecklistInput,
  documents: ExistingDocument[] = []
): ResolvedChecklistItem[] {
  const keys = selectTemplateKeys(input);
  const merged = new Map<string, ChecklistItemDef>();

  for (const tplKey of keys) {
    const tpl = CHECKLIST_TEMPLATES.find((t) => t.key === tplKey);
    if (!tpl) continue;
    for (const it of tpl.items) {
      // Strengste Anforderung gewinnt bei Dubletten.
      const existing = merged.get(it.key);
      if (!existing || rank(it.level) > rank(existing.level)) merged.set(it.key, it);
    }
  }

  return [...merged.values()]
    .sort((a, b) => rank(b.level) - rank(a.level))
    .map((def) => resolveStatus(def, documents));
}

function resolveStatus(
  def: ChecklistItemDef,
  documents: ExistingDocument[]
): ResolvedChecklistItem {
  const matches = documents.filter(
    (d) => d.documentType === def.documentType && d.reviewStatus !== "abgelehnt" && d.reviewStatus !== "duplikat"
  );
  let status: ResolvedChecklistItem["status"] = "offen";

  if (matches.length > 0) {
    const required = def.requiredCount ?? 1;
    const unreadable = matches.some((m) => m.readable === false);
    const tooOld =
      def.recencyDays != null &&
      matches.every((m) => (m.ageDays ?? 0) > def.recencyDays!);
    if (unreadable) status = "unvollstaendig";
    else if (tooOld) status = "nicht_aktuell";
    else if (matches.length < required) status = "unvollstaendig";
    else status = "vorhanden";
  }

  return {
    ...def,
    status,
    matchedDocuments: matches.length,
    // KO-/Risikobewertungen sind intern; reine Unterlagen-Checkliste ist für Kunde sichtbar.
    customerVisible: def.scope !== "bankbezogen",
  };
}

function rank(level: RequirementLevel): number {
  switch (level) {
    case "zwingend":
      return 4;
    case "bankabhaengig":
      return 3;
    case "spaeter":
      return 2;
    case "optional":
      return 1;
  }
}

/** Plattformbezug einer Position (für Nachforderungsfilter). */
export function itemPlatforms(item: ChecklistItemDef): Platform[] {
  return item.platforms;
}
