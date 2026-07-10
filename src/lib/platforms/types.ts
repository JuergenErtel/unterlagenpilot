import type { Platform } from "@/lib/domain/enums";

/**
 * Saubere Integrationsschicht (Provider-Pattern) für Europace, FinLink,
 * eHyp home, manuellen Export und (späteren) Browser-Assist-Fallback.
 * Im MVP sind echte API-Aufrufe Stubs – keine Endpunkte werden erraten.
 * Jede Übertragung erfolgt nur nach manueller Freigabe (released-Flag).
 */

export interface ConnectionStatus {
  ok: boolean;
  message: string;
}

export interface ImportResult {
  ok: boolean;
  importedCaseIds: string[];
  message: string;
}

export interface PlatformField {
  platformField: string;
  label: string;
  value: string | number | boolean | null;
  confidence: number;
  requiresReview: boolean;
}

export interface PlatformPayload {
  platform: Platform;
  groups: Array<{ group: string; fields: PlatformField[] }>;
  missingRequiredFields: string[];
}

export interface ValidationResult {
  valid: boolean;
  missingRequiredFields: string[];
  warnings: string[];
}

export interface PushResult {
  ok: boolean;
  externalId?: string;
  message: string;
  /** True nur, wenn echte API-Übertragung erfolgte. */
  transmitted: boolean;
}

export interface UploadResult {
  ok: boolean;
  uploaded: number;
  message: string;
}

export interface RequirementResult {
  ok: boolean;
  missing: Array<{ key: string; title: string }>;
}

export interface PlatformDocument {
  id: string;
  generatedName: string;
  documentType: string | null;
}

export interface PlatformConnector {
  readonly name: Platform | "manual" | "browser-assist";
  isConfigured(): Promise<boolean>;
  testConnection(): Promise<ConnectionStatus>;
  importCases?(): Promise<ImportResult>;
  importCaseById?(
    externalId: string,
    ctx?: { organizationId: string; userId: string },
    deps?: unknown
  ): Promise<ImportResult>;
  mapCaseData(caseId: string): Promise<PlatformPayload>;
  validatePayload(payload: PlatformPayload): Promise<ValidationResult>;
  pushCaseData(payload: PlatformPayload): Promise<PushResult>;
  uploadDocuments(caseId: string, documents: PlatformDocument[]): Promise<UploadResult>;
  getMissingRequirements?(caseId: string): Promise<RequirementResult>;
}
