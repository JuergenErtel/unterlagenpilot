import type { CanonicalCase } from "@/lib/domain/canonical";
import type { Platform } from "@/lib/domain/enums";
import type { PlatformPayload, PlatformField } from "./types";

/**
 * Mapping-Layer: kanonisches Modell <-> Plattformen.
 * Alles geht über das interne kanonische Modell, damit z.B.
 * Europace -> internal -> eHyp home verlustarm funktioniert.
 */

type FieldSpec = {
  platformField: string;
  label: string;
  get: (c: CanonicalCase) => string | number | boolean | null | undefined;
  required?: boolean;
};

const applicantFields = (prefix: string, index: number): FieldSpec[] => [
  { platformField: `${prefix}.vorname`, label: "Vorname", get: (c) => c.applicants[index]?.vorname, required: true },
  { platformField: `${prefix}.nachname`, label: "Nachname", get: (c) => c.applicants[index]?.nachname, required: true },
  { platformField: `${prefix}.geburtsdatum`, label: "Geburtsdatum", get: (c) => c.applicants[index]?.geburtsdatum, required: true },
  { platformField: `${prefix}.familienstand`, label: "Familienstand", get: (c) => c.applicants[index]?.familienstand },
  { platformField: `${prefix}.kinder`, label: "Anzahl Kinder", get: (c) => c.applicants[index]?.anzahlKinder ?? 0 },
];

const incomeFields: FieldSpec[] = [
  { platformField: "einkommen.netto", label: "Netto monatlich", get: (c) => c.income[0]?.nettoMonatlich, required: true },
  { platformField: "einkommen.brutto", label: "Brutto monatlich", get: (c) => c.income[0]?.bruttoMonatlich },
  { platformField: "beschaeftigung.art", label: "Beschäftigungsart", get: (c) => c.employment[0]?.beschaeftigungsart },
  { platformField: "beschaeftigung.arbeitgeber", label: "Arbeitgeber", get: (c) => c.employment[0]?.arbeitgeber },
];

const objectFields: FieldSpec[] = [
  { platformField: "objekt.art", label: "Objektart", get: (c) => c.property?.objektart, required: true },
  { platformField: "objekt.strasse", label: "Objekt Straße", get: (c) => c.property?.strasse, required: true },
  { platformField: "objekt.plz", label: "Objekt PLZ", get: (c) => c.property?.plz, required: true },
  { platformField: "objekt.ort", label: "Objekt Ort", get: (c) => c.property?.ort, required: true },
  { platformField: "objekt.wohnflaeche", label: "Wohnfläche", get: (c) => c.property?.wohnflaeche, required: true },
  { platformField: "objekt.baujahr", label: "Baujahr", get: (c) => c.property?.baujahr },
];

const financingFields: FieldSpec[] = [
  { platformField: "finanzierung.kaufpreis", label: "Kaufpreis", get: (c) => c.financing.kaufpreis, required: true },
  { platformField: "finanzierung.eigenkapital", label: "Eigenkapital", get: (c) => c.financing.eigenkapital, required: true },
  { platformField: "finanzierung.darlehenswunsch", label: "Darlehenswunsch", get: (c) => c.financing.darlehenswunsch, required: true },
  { platformField: "finanzierung.nebenkosten", label: "Nebenkosten", get: (c) => c.financing.nebenkosten },
];

/** Plattformspezifische Feld-Präfixe je Antragsteller (Index 0 = A1, 1 = A2). */
const APPLICANT_PREFIXES: Record<Platform, [string, string]> = {
  europace: ["ep.antragsteller1", "ep.antragsteller2"],
  finlink: ["fl.kunde", "fl.kunde2"],
  ehyp_home: ["ehyp.applicant", "ehyp.applicant2"],
};

// Gruppen jenseits der Antragsteller sind über alle Plattformen identisch.
const NON_APPLICANT_GROUPS: Array<{ group: string; fields: FieldSpec[] }> = [
  { group: "Einkommen", fields: incomeFields },
  { group: "Objekt", fields: objectFields },
  { group: "Finanzierung", fields: financingFields },
];

/**
 * Baut die Feldgruppen für eine Plattform. Die zweite Antragsteller-Gruppe wird
 * NUR erzeugt, wenn ein zweiter Antragsteller existiert – sonst würden dessen
 * Pflichtfelder den Fall fälschlich als unvollständig markieren.
 */
function groupsFor(platform: Platform, c: CanonicalCase): Array<{ group: string; fields: FieldSpec[] }> {
  const [p1, p2] = APPLICANT_PREFIXES[platform];
  const hasSecond = c.applicants.length >= 2;
  const groups: Array<{ group: string; fields: FieldSpec[] }> = [
    { group: hasSecond ? "Antragsteller 1" : "Antragsteller", fields: applicantFields(p1, 0) },
  ];
  if (hasSecond) {
    groups.push({ group: "Antragsteller 2", fields: applicantFields(p2, 1) });
  }
  groups.push(...NON_APPLICANT_GROUPS);
  return groups;
}

function toField(spec: FieldSpec, c: CanonicalCase): PlatformField {
  const raw = spec.get(c);
  const value = raw === undefined ? null : raw;
  return {
    platformField: spec.platformField,
    label: spec.label,
    value,
    // Konfidenz hier konservativ; echte Konfidenz kommt aus Extraktion.
    confidence: value == null ? 0 : 0.9,
    // Kritische Felder immer zur manuellen Prüfung markieren.
    requiresReview: Boolean(spec.required),
  };
}

export function buildPlatformMapping(
  c: CanonicalCase,
  platform: Platform
): PlatformPayload {
  const specGroups = groupsFor(platform, c);
  const groups = specGroups.map((g) => ({
    group: g.group,
    fields: g.fields.map((f) => toField(f, c)),
  }));
  const missingRequiredFields = specGroups
    .flatMap((g) => g.fields)
    .filter((f) => f.required && isEmpty(f.get(c)))
    .map((f) => f.platformField);

  return { platform, groups, missingRequiredFields };
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/**
 * Spezialworkflow: Europace -> eHyp home (über internal canonical model).
 * Zeigt fehlende eHyp-home-Pflichtfelder und die Unterschiede der Datenmodelle.
 */
export interface EuropaceToEhypResult {
  ehypPayload: PlatformPayload;
  missingForEhyp: string[];
  differences: Array<{ field: string; europace: unknown; ehyp: unknown }>;
}

export function europaceToEhyp(c: CanonicalCase): EuropaceToEhypResult {
  const europace = buildPlatformMapping(c, "europace");
  const ehyp = buildPlatformMapping(c, "ehyp_home");

  // Unterschiede auf Basis derselben kanonischen Werte (Feldnamen differieren).
  const epFlat = flatten(europace);
  const ehFlat = flatten(ehyp);
  const differences: EuropaceToEhypResult["differences"] = [];
  const labels = new Set([...epFlat.keys(), ...ehFlat.keys()]);
  for (const label of labels) {
    const a = epFlat.get(label);
    const b = ehFlat.get(label);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      differences.push({ field: label, europace: a ?? null, ehyp: b ?? null });
    }
  }

  return {
    ehypPayload: ehyp,
    missingForEhyp: ehyp.missingRequiredFields,
    differences,
  };
}

function flatten(p: PlatformPayload): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const g of p.groups) for (const f of g.fields) m.set(f.label, f.value);
  return m;
}
