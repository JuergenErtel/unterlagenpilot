import { z } from "zod";

/**
 * Zentrale, validierte Umgebungsvariablen.
 * Secrets kommen ausschliesslich aus der Umgebung – niemals hardcoden.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgresql://localhost:5432/unterlagenpilot"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16).default("dev-secret-change-me-please-32chars"),
  UPLOAD_TOKEN_SECRET: z
    .string()
    .min(16)
    .default("dev-upload-secret-change-me-32chars"),

  STORAGE_PROVIDER: z.enum(["local", "s3", "supabase"]).default("local"),
  STORAGE_BUCKET: z.string().default("unterlagenpilot"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  AI_PROVIDER: z
    .enum(["mock", "azure-openai", "openai-compatible"])
    .default("mock"),
  // Azure OpenAI (EU-Region!)
  AZURE_OPENAI_ENDPOINT: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().optional(),
  AZURE_OPENAI_API_VERSION: z.string().default("2024-10-21"),
  // Generischer EU-OpenAI-kompatibler Anbieter (z.B. Mistral AI, EU-Endpoint)
  OPENAI_COMPATIBLE_BASE_URL: z.string().optional(), // z.B. https://api.mistral.ai/v1
  OPENAI_COMPATIBLE_API_KEY: z.string().optional(),
  OPENAI_COMPATIBLE_MODEL: z.string().optional(), // z.B. mistral-large-latest

  OCR_PROVIDER: z
    .enum(["mock", "mistral", "azure-document-intelligence", "tesseract"])
    .default("mock"),
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: z.string().optional(),
  AZURE_DOCUMENT_INTELLIGENCE_KEY: z.string().optional(),
  // Mistral OCR (EU). Key fällt auf OPENAI_COMPATIBLE_API_KEY zurück (gleiches Konto).
  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_API_BASE_URL: z.string().default("https://api.mistral.ai/v1"),
  MISTRAL_OCR_MODEL: z.string().default("mistral-ocr-latest"),

  DEFAULT_RETENTION_DAYS: z.coerce.number().int().min(0).default(0),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Keine Kundendaten – nur Konfigurationsfehler ausgeben.
    console.error("Ungueltige Umgebungskonfiguration:", parsed.error.flatten().fieldErrors);
    throw new Error("Ungueltige Umgebungskonfiguration. Siehe .env.example");
  }
  cached = parsed.data;
  return cached;
}
