/**
 * Austauschbare AI-/OCR-Provider-Schicht (DSGVO/EU-konform konfigurierbar).
 * Provider liefern Roh-JSON; Validierung & Retry/Repair passiert im AIService.
 * Es werden KEINE Kundendaten in Logs geschrieben.
 */

export interface AICompletionRequest {
  /** Logischer Name des erwarteten Schemas (Provider-Routing/Mock-Steuerung) */
  schemaName: string;
  system: string;
  user: string;
  /** JSON-Schema der erwarteten Ausgabe (für echte LLMs als Vertrag). */
  jsonSchema?: Record<string, unknown>;
  /** Optionaler Kontext für deterministische Mock-Ausgaben */
  hints?: Record<string, unknown>;
  /** Optionale Bilder (Vision). base64 OHNE data:-Präfix. */
  images?: Array<{ base64: string; mimeType: string }>;
}

export interface AIProvider {
  readonly name: string;
  /** EU/DSGVO-konform konfiguriert? */
  isConfigured(): boolean;
  /** Liefert ein geparstes JSON-Objekt (unvalidiert). */
  completeJSON(req: AICompletionRequest): Promise<unknown>;
}

export interface OcrPage {
  pageNumber: number;
  text: string;
  width?: number;
  height?: number;
}

export interface OcrResult {
  pageCount: number;
  pages: OcrPage[];
  /** Gesamttext (für Klassifizierung/Extraktion) */
  fullText: string;
}

export interface OcrInput {
  storageKey: string;
  mimeType: string;
  originalName: string;
  /** Optional bereits geladener Inhalt (z.B. lokaler Storage) */
  buffer?: Buffer;
}

export interface OCRProvider {
  readonly name: string;
  isConfigured(): boolean;
  extractText(input: OcrInput): Promise<OcrResult>;
}
