import { z } from "zod";
import { DOCUMENT_TYPES, SEVERITIES } from "./enums";

/**
 * Zod-Schemas für ALLE strukturierten KI-Ausgaben.
 * Jede KI-Ausgabe MUSS gegen diese Schemas validiert werden (Retry/Repair bei
 * Fehler). Jede Auswertung traegt Konfidenzwerte. Kritische Daten werden nie
 * ungeprueft uebernommen.
 */

export const confidence = z.number().min(0).max(1);

/** Ein einzelnes extrahiertes Feld inkl. Konfidenz und Quelle */
export const extractedFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence,
  source: z.string().optional(), // z.B. "Seite 1, Zeile Netto"
});
export type ExtractedField = z.infer<typeof extractedFieldSchema>;

export const warningSchema = z.object({
  code: z.string(),
  severity: z.enum(SEVERITIES),
  message: z.string(),
  // Interne KO-/Risikohinweise werden dem Kunden NICHT gezeigt.
  customerVisible: z.boolean().default(false),
});
export type AiWarning = z.infer<typeof warningSchema>;

/** classifyDocument */
export const classificationSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  confidence,
  detectedApplicant: z.string().nullable().optional(),
  detectedPropertyRef: z.string().nullable().optional(),
  period: z.string().nullable().optional(),
  issuer: z.string().nullable().optional(),
  pageCount: z.number().int().nonnegative().optional(),
  reasoning: z.string().optional(),
});
export type ClassificationResult = z.infer<typeof classificationSchema>;

/** extractFields (generisch) */
export const extractionSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  fields: z.array(extractedFieldSchema),
  warnings: z.array(warningSchema).default([]),
  overallConfidence: confidence,
});
export type ExtractionResult = z.infer<typeof extractionSchema>;

/** assessScanQuality */
export const scanQualitySchema = z.object({
  readable: z.boolean(),
  resolutionOk: z.boolean(),
  truncatedPages: z.boolean(),
  missingPages: z.boolean(),
  confidence,
  warnings: z.array(warningSchema).default([]),
});
export type ScanQualityResult = z.infer<typeof scanQualitySchema>;

/** detectDuplicateDocuments */
export const duplicateSchema = z.object({
  isDuplicate: z.boolean(),
  isNearDuplicate: z.boolean(),
  similarity: confidence,
  reasoning: z.string().optional(),
});
export type DuplicateResult = z.infer<typeof duplicateSchema>;

/** assignDocumentToApplicantOrProperty */
export const assignmentSchema = z.object({
  applicantPosition: z.number().int().positive().nullable(),
  propertyRef: z.string().nullable(),
  financingRef: z.string().nullable(),
  liabilityRef: z.string().nullable(),
  assetRef: z.string().nullable(),
  confidence,
  reasoning: z.string().optional(),
});
export type AssignmentResult = z.infer<typeof assignmentSchema>;

/** Eine einzelne Plausibilitätsprüfung */
export const plausibilityCheckSchema = z.object({
  key: z.string(),
  category: z.string(),
  status: z.enum(SEVERITIES),
  explanation: z.string(),
  recommendedAction: z.string().optional(),
  customerVisible: z.boolean().default(false),
  relevantEuropace: z.boolean().default(false),
  relevantFinlink: z.boolean().default(false),
  relevantEhyp: z.boolean().default(false),
});
export type PlausibilityCheck = z.infer<typeof plausibilityCheckSchema>;

export const plausibilityResultSchema = z.object({
  checks: z.array(plausibilityCheckSchema),
  overallConfidence: confidence,
});
export type PlausibilityResult = z.infer<typeof plausibilityResultSchema>;

/** detectMissingDocuments / detectBankSpecificRequirements */
export const missingRequirementSchema = z.object({
  requirementKey: z.string(),
  documentType: z.enum(DOCUMENT_TYPES).nullable(),
  title: z.string(),
  reason: z.string(),
  level: z.enum(["zwingend", "spaeter", "optional", "bankabhaengig"]),
  platform: z.enum(["europace", "finlink", "ehyp_home", "allgemein"]),
  bank: z.string().nullable().optional(),
  customerVisible: z.boolean().default(true),
});
export type MissingRequirement = z.infer<typeof missingRequirementSchema>;

export const missingDocumentsResultSchema = z.object({
  missing: z.array(missingRequirementSchema),
  confidence,
});
export type MissingDocumentsResult = z.infer<typeof missingDocumentsResultSchema>;

/** createBankSummary – neutral, sachlich, banktauglich */
export const bankSummarySchema = z.object({
  kurzprofil: z.string(),
  einkommenBeschaeftigung: z.string(),
  selbststaendigkeit: z.string().nullable().optional(),
  objektuebersicht: z.string(),
  finanzierungsbedarf: z.string(),
  eigenkapital: z.string(),
  vorhandeneUnterlagen: z.array(z.string()),
  fehlendeUnterlagen: z.array(z.string()),
  risikenNeutral: z.array(z.string()),
  offenePunkte: z.array(z.string()),
});
export type BankSummary = z.infer<typeof bankSummarySchema>;

/** generateCustomerEmail / WhatsApp / PDF */
export const generatedMessageSchema = z.object({
  channel: z.enum(["email", "whatsapp", "pdf", "intern"]),
  subject: z.string().nullable().optional(),
  body: z.string(),
});
export type GeneratedMessageResult = z.infer<typeof generatedMessageSchema>;

/** createPlatformMapping */
export const platformMappingSchema = z.object({
  platform: z.enum(["europace", "finlink", "ehyp_home"]),
  groups: z.array(
    z.object({
      group: z.string(),
      fields: z.array(
        z.object({
          platformField: z.string(),
          label: z.string(),
          value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
          confidence,
          requiresReview: z.boolean().default(false),
        })
      ),
    })
  ),
  missingRequiredFields: z.array(z.string()).default([]),
});
export type PlatformMappingResult = z.infer<typeof platformMappingSchema>;
