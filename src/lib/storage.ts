import { getEnv } from "@/lib/env";
import { randomToken } from "@/lib/security/upload-token";

/**
 * Storage-Abstraktion (local / supabase / s3).
 *  - local:    In-Memory (nur Dev/Demo, nicht persistent)
 *  - supabase: Supabase Storage (PRIVATER Bucket, Service-Role-Key serverseitig,
 *              signierte Download-URLs mit kurzer Gültigkeit)
 *  - s3:       Stub (TODO: S3-kompatibel anbinden, Server-Side-Encryption SSE-KMS)
 *
 * Sicherheit:
 *  - Sensible Dokumente liegen IMMER in einem privaten Bucket – nie öffentlich.
 *  - Pfade sind mandanten- und fallbezogen strukturiert (Tenant-Isolation).
 *  - Download nur über signierte, kurzlebige URLs bzw. die authentifizierte
 *    App-Route /api/documents/[id]/download (Audit + Zugriffsprüfung).
 *  - At-Rest-Verschlüsselung: Supabase verschlüsselt Buckets serverseitig; für S3
 *    SSE-KMS aktivieren. OCR-Text (DocumentPage.ocrText) zusätzlich app-seitig
 *    verschlüsseln (TODO(prod), siehe README → Datenschutz).
 *  - Keine Kundendaten in Logs.
 */
export interface StoredObject {
  storageKey: string;
  sizeBytes: number;
  mimeType: string;
}

export interface PutInput {
  organizationId: string;
  caseId: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface StorageProvider {
  put(input: PutInput): Promise<StoredObject>;
  get(storageKey: string): Promise<Buffer | null>;
  remove(storageKey: string): Promise<void>;
  /** Signierte, kurzlebige Download-URL. null, wenn Provider keine direkte URL kann. */
  createSignedUrl(storageKey: string, expiresInSec: number): Promise<string | null>;
}

/** Mandanten-/fallbezogener Objektpfad. */
export function objectPath(organizationId: string, caseId: string, originalName: string): string {
  const safe = originalName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  return `organizations/${organizationId}/cases/${caseId}/documents/${randomToken(8)}_${safe}`;
}

// ---- In-Memory (Dev/Demo) ----
const memory = new Map<string, Buffer>();

class LocalStorageProvider implements StorageProvider {
  async put(input: PutInput): Promise<StoredObject> {
    const key = objectPath(input.organizationId, input.caseId, input.originalName);
    memory.set(key, input.buffer);
    return { storageKey: key, sizeBytes: input.buffer.byteLength, mimeType: input.mimeType };
  }
  async get(storageKey: string): Promise<Buffer | null> {
    return memory.get(storageKey) ?? null;
  }
  async remove(storageKey: string): Promise<void> {
    memory.delete(storageKey);
  }
  async createSignedUrl(): Promise<string | null> {
    // In-Memory: kein direkter Link – Download läuft über die App-Route.
    return null;
  }
}

// ---- Supabase Storage ----
class SupabaseStorageProvider implements StorageProvider {
  private bucket: string;
  private clientPromise: Promise<import("@supabase/supabase-js").SupabaseClient> | null = null;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const env = getEnv();
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
          throw new Error("Supabase-Storage nicht konfiguriert: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY setzen.");
        }
        const { createClient } = await import("@supabase/supabase-js");
        return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false },
        });
      })();
    }
    return this.clientPromise;
  }

  async put(input: PutInput): Promise<StoredObject> {
    const supabase = await this.client();
    const key = objectPath(input.organizationId, input.caseId, input.originalName);
    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(key, input.buffer, { contentType: input.mimeType, upsert: false });
    if (error) throw new Error(`Supabase-Upload fehlgeschlagen: ${error.message}`);
    return { storageKey: key, sizeBytes: input.buffer.byteLength, mimeType: input.mimeType };
  }

  async get(storageKey: string): Promise<Buffer | null> {
    const supabase = await this.client();
    const { data, error } = await supabase.storage.from(this.bucket).download(storageKey);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(storageKey: string): Promise<void> {
    const supabase = await this.client();
    await supabase.storage.from(this.bucket).remove([storageKey]);
  }

  async createSignedUrl(storageKey: string, expiresInSec: number): Promise<string | null> {
    const supabase = await this.client();
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(storageKey, expiresInSec);
    if (error || !data) return null;
    return data.signedUrl;
  }
}

// ---- S3-kompatibel (Stub) ----
class S3StorageProvider implements StorageProvider {
  async put(_input: PutInput): Promise<StoredObject> {
    throw new Error("S3-Storage ist ein Stub. STORAGE_PROVIDER=supabase oder local verwenden, oder S3 implementieren.");
  }
  async get(_storageKey: string): Promise<Buffer | null> {
    return null;
  }
  async remove(_storageKey: string): Promise<void> {
    // no-op im Stub
  }
  async createSignedUrl(_storageKey: string, _expiresInSec: number): Promise<string | null> {
    // TODO(prod): S3 GetObject Presigned URL (kurzlebig), Bucket privat + SSE-KMS.
    return null;
  }
}

let provider: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (provider) return provider;
  const env = getEnv();
  switch (env.STORAGE_PROVIDER) {
    case "supabase":
      provider = new SupabaseStorageProvider(env.STORAGE_BUCKET);
      break;
    case "s3":
      provider = new S3StorageProvider();
      break;
    case "local":
    default:
      provider = new LocalStorageProvider();
  }
  return provider;
}
