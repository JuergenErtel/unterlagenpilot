import type { ChecklistItemDef } from "@/lib/checklists/templates";
import type { DocumentType, Platform, RequirementLevel } from "@/lib/domain/enums";
import { BankRequirementRules } from "@/lib/rules/requirements";

const ALL_PLATFORMS: Platform[] = ["europace", "finlink", "ehyp_home"];

/** Eine bankindividuelle Anforderung (aus statischem Katalog oder DB). */
export interface BankRequirementInput {
  key: string;
  title: string;
  documentType: DocumentType | null;
  level: RequirementLevel;
}

/**
 * Überführt bankindividuelle Anforderungen in Checklisten-Positionen, damit sie
 * neben den fallbezogenen Standard-Unterlagen erscheinen und in Score/Nachforderung
 * einfließen. Bewusst `scope: "bankbezogen"` → nur intern, nicht kundensichtbar,
 * damit die Kunden-Checkliste nicht mit Bank-Interna überfrachtet wird.
 */
export function bankRequirementItems(reqs: BankRequirementInput[]): ChecklistItemDef[] {
  return reqs.map((r) => ({
    key: r.key,
    name: r.title,
    customerDescription: r.title,
    internalDescription: "Bankindividuelle Anforderung.",
    documentType: r.documentType,
    level: r.level,
    scope: "bankbezogen",
    platforms: ALL_PLATFORMS,
    acceptedFileTypes: ["pdf", "jpg", "png"],
    requiredCount: 1,
    bankSpecific: true,
  }));
}

/**
 * Sammelt alle Anforderungen einer Bank: den statischen Katalog
 * (`BankRequirementRules`) plus die org-spezifisch gepflegten DB-Einträge.
 * DB-Einträge haben Vorrang bei gleichem `key`.
 */
export function resolveBankRequirements(
  bankName: string | null | undefined,
  dbRequirements: BankRequirementInput[] = []
): BankRequirementInput[] {
  if (!bankName) return dbRequirements;
  const staticReqs = (BankRequirementRules[bankName] ?? []).map((r) => ({
    key: r.key,
    title: r.title,
    documentType: r.documentType,
    level: r.level,
  }));
  const byKey = new Map<string, BankRequirementInput>();
  for (const r of staticReqs) byKey.set(r.key, r);
  for (const r of dbRequirements) byKey.set(r.key, r); // DB gewinnt
  return [...byKey.values()];
}
