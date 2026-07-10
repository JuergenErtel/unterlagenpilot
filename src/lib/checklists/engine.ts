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
  /**
   * IDs der Antragsteller. Nötig, um personenbezogene Positionen (Ausweis,
   * Gehaltsabrechnung) je Person statt fallweit zu prüfen.
   */
  applicantIds?: string[];
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
  /** Tatsächlich verlangte Anzahl (bei perApplicant × Anzahl Antragsteller). */
  effectiveRequiredCount: number;
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
  /** Zugeordneter Antragsteller (null = noch nicht zugeordnet). */
  applicantId?: string | null;
}

/**
 * Baut die fallbezogene Checkliste: kombiniert Templates, dedupliziert nach key,
 * und bestimmt den Status je Position anhand vorhandener Dokumente.
 */
export function buildChecklistForCase(
  input: CaseChecklistInput,
  documents: ExistingDocument[] = [],
  /** Zusätzliche, fallbezogen aufgelöste Positionen (z. B. Bankanforderungen). */
  extraItems: ChecklistItemDef[] = []
): ResolvedChecklistItem[] {
  const keys = selectTemplateKeys(input);
  const merged = new Map<string, ChecklistItemDef>();

  const addItem = (it: ChecklistItemDef) => {
    // Strengste Anforderung gewinnt bei Dubletten.
    const existing = merged.get(it.key);
    if (!existing || rank(it.level) > rank(existing.level)) merged.set(it.key, it);
  };

  for (const tplKey of keys) {
    const tpl = CHECKLIST_TEMPLATES.find((t) => t.key === tplKey);
    if (!tpl) continue;
    for (const it of tpl.items) addItem(it);
  }
  for (const it of extraItems) addItem(it);

  const applicantIds = input.applicantIds ?? [];
  const applicantCount = Math.max(input.applicantCount ?? applicantIds.length ?? 1, 1);

  return [...merged.values()]
    .sort((a, b) => rank(b.level) - rank(a.level))
    .map((def) => resolveStatus(def, documents, applicantIds, applicantCount));
}

/** Zählt lesbare, hinreichend aktuelle Treffer und bewertet eine Teilmenge. */
function evaluateMatches(
  def: ChecklistItemDef,
  matches: ExistingDocument[],
  required: number
): { fulfilled: boolean; tooOld: boolean } {
  // Unlesbare Dokumente zählen nicht zur Erfüllung.
  const readable = matches.filter((m) => m.readable !== false);
  const fulfilled = readable.length >= required;

  // Aktualität nur anhand von Dokumenten mit BEKANNTEM Alter beurteilen.
  // Ein Dokument ohne erkannten Zeitraum beweist weder Aktualität noch das
  // Gegenteil – früher galt `ageDays ?? 0`, also "unbekannt = brandaktuell",
  // wodurch ein einziges undatiertes Dokument veraltete Unterlagen kaschierte.
  let tooOld = false;
  if (def.recencyDays != null && fulfilled) {
    const dated = readable.filter((m) => m.ageDays != null);
    tooOld = dated.length > 0 && dated.every((m) => m.ageDays! > def.recencyDays!);
  }
  return { fulfilled, tooOld };
}

function resolveStatus(
  def: ChecklistItemDef,
  documents: ExistingDocument[],
  applicantIds: string[],
  applicantCount: number
): ResolvedChecklistItem {
  const matches = documents.filter(
    (d) => d.documentType === def.documentType && d.reviewStatus !== "abgelehnt" && d.reviewStatus !== "duplikat"
  );
  const perPerson = def.requiredCount ?? 1;
  const perApplicant = def.perApplicant === true && applicantCount > 1;
  const effectiveRequiredCount = perApplicant ? perPerson * applicantCount : perPerson;

  let status: ResolvedChecklistItem["status"] = "offen";

  if (matches.length > 0) {
    if (perApplicant && applicantIds.length > 0) {
      // Jede Person muss ihr eigenes Soll erfüllen. Nicht zugeordnete Dokumente
      // können keiner Person gutgeschrieben werden – der Vermittler ordnet sie
      // im Review-Center zu. Sonst gälte die Position als erfüllt, obwohl von
      // Antragsteller 2 nichts vorliegt.
      const perResults = applicantIds.map((id) =>
        evaluateMatches(def, matches.filter((m) => m.applicantId === id), perPerson)
      );
      const allFulfilled = perResults.every((r) => r.fulfilled);
      status = allFulfilled ? (perResults.some((r) => r.tooOld) ? "nicht_aktuell" : "vorhanden") : "unvollstaendig";
    } else {
      const { fulfilled, tooOld } = evaluateMatches(def, matches, effectiveRequiredCount);
      status = fulfilled ? (tooOld ? "nicht_aktuell" : "vorhanden") : "unvollstaendig";
    }
  }

  return {
    ...def,
    status,
    matchedDocuments: matches.length,
    effectiveRequiredCount,
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
