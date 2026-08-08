import type { CaseChecklistInput } from "./engine";
import type {
  EmploymentType,
  FinancingType,
  PropertyType,
  UsageType,
} from "@/lib/domain/enums";

/**
 * Die EINE Stelle, an der aus einer Falldatenzeile die Eingabe der Checkliste
 * entsteht.
 *
 * Warum das eine eigene Funktion ist: Vorher baute jede Sicht ihre Eingabe
 * selbst zusammen – und jede vergass etwas anderes. Die Kundensicht liess
 * `employmentType` weg, der Erstkontakt `propertyType` und `usage`. Fuer einen
 * Selbststaendigen hiess das: Die Erstkontakt-Mail verlangte BWA und
 * Jahresabschluss, die Upload-Seite fiel auf "angestellter_kauf" zurueck und
 * verlangte Gehaltsabrechnungen. Der Kunde konnte gar nichts hochladen, was zu
 * einer sichtbaren Position gepasst haette.
 *
 * Wer eine neue Sicht baut, ruft diese Funktion auf – dann koennen die Listen
 * nicht erneut auseinanderlaufen.
 */
export interface FallFuerCheckliste {
  financingType: string | null;
  primaryEmploymentType: string | null;
  kapitalanlage: boolean;
  /** Objektdaten, soweit vorhanden. Steuern Objektart- und Nutzungspositionen. */
  property?: { objektart: string | null; nutzung: string | null } | null;
  applicants: Array<{ id: string; position: number }>;
}

export function checklistEingabeFuerFall(fall: FallFuerCheckliste): CaseChecklistInput {
  return {
    financingType: (fall.financingType as FinancingType) ?? undefined,
    employmentType: (fall.primaryEmploymentType as EmploymentType) ?? undefined,
    propertyType: (fall.property?.objektart as PropertyType) ?? undefined,
    usage: (fall.property?.nutzung as UsageType) ?? undefined,
    kapitalanlage: fall.kapitalanlage,
    applicantCount: fall.applicants.length,
    // Reihenfolge nach `position`, damit personenbezogene Positionen in allen
    // Sichten denselben Antragsteller meinen.
    applicantIds: fall.applicants
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((a) => a.id),
  };
}
