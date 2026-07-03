import { z } from "zod";

/**
 * Zentrale, validierte Umgebungsvariablen.
 * Secrets kommen ausschliesslich aus der Umgebung – niemals hardcoden.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgresql://localhost:5432/unterlagenpilot"),
  // Direkte (ungepoolte) Verbindung für Migrationen/Introspektion (Supabase Port 5432).
  DIRECT_URL: z.string().optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16).default("dev-secret-change-me-please-32chars"),
  UPLOAD_TOKEN_SECRET: z
    .string()
    .min(16)
    .default("dev-upload-secret-change-me-32chars"),

  // Auth-Modus: "demo" = automatischer Seed-Vermittler ohne Login (nur Dev/Demo),
  // "session" = echte Login-/Session-Pflicht (für echte Pilotdaten verbindlich).
  AUTH_MODE: z.enum(["demo", "session"]).default("demo"),
  SESSION_COOKIE_NAME: z.string().default("up_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  // Rate-Limiting (in-memory; produktiv: zentraler Store wie Upstash/Redis)
  LOGIN_RATE_MAX: z.coerce.number().int().min(1).default(5),
  LOGIN_RATE_WINDOW_SEC: z.coerce.number().int().min(10).default(300),
  UPLOAD_RATE_MAX: z.coerce.number().int().min(1).default(30),
  UPLOAD_RATE_WINDOW_SEC: z.coerce.number().int().min(10).default(600),

  STORAGE_PROVIDER: z.enum(["local", "s3", "supabase"]).default("local"),
  STORAGE_BUCKET: z.string().default("unterlagenpilot"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  // Signierte Download-URLs: kurze Gültigkeit gegen Link-Weitergabe.
  DOWNLOAD_URL_TTL_SEC: z.coerce.number().int().min(15).max(3600).default(120),

  // Upload-Sicherheit
  UPLOAD_MAX_MB: z.coerce.number().int().min(1).max(200).default(25),
  VIRUS_SCANNER: z.enum(["mock", "clamav"]).default("mock"),
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().int().optional(),

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

  // E-Mail-Versand (Resend). Ohne beide Werte ist der Versand deaktiviert
  // (Nachrichten bleiben dann Copy-Paste-Vorlagen).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(), // z.B. "UnterlagenPilot <noreply@immocockpit24.de>"
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
