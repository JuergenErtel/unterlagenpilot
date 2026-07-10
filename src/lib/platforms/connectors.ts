import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { caseToCanonical } from "./case-loader";
import { buildPlatformMapping } from "./mapping";
import { getFinLinkClient, type FinLinkClient, FinLinkNotFoundError, FinLinkAuthError } from "./finlink/client";
import { finlinkToCanonical } from "./finlink/mapping";
import { createCaseFromCanonical } from "./case-writer";
import type {
  ConnectionStatus,
  ImportResult,
  PlatformConnector,
  PlatformDocument,
  PlatformPayload,
  PushResult,
  RequirementResult,
  UploadResult,
  ValidationResult,
} from "./types";

/** Gemeinsame Default-Implementierungen für Mapping/Validierung. */
abstract class BaseConnector implements PlatformConnector {
  abstract readonly name: PlatformConnector["name"];
  abstract isConfigured(): Promise<boolean>;
  abstract testConnection(): Promise<ConnectionStatus>;

  protected abstract platformKey(): "europace" | "finlink" | "ehyp_home";

  async mapCaseData(caseId: string): Promise<PlatformPayload> {
    const canonical = await caseToCanonical(caseId);
    return buildPlatformMapping(canonical, this.platformKey());
  }

  async validatePayload(payload: PlatformPayload): Promise<ValidationResult> {
    const warnings = payload.groups
      .flatMap((g) => g.fields)
      .filter((f) => f.value != null && f.confidence < 0.6)
      .map((f) => `Niedrige Konfidenz: ${f.label}`);
    return {
      valid: payload.missingRequiredFields.length === 0,
      missingRequiredFields: payload.missingRequiredFields,
      warnings,
    };
  }

  /**
   * MVP: KEINE echte Übertragung. Liefert "nicht übertragen" und verlangt
   * manuellen Export. Echte API-Anbindung später nach Freigabe.
   */
  async pushCaseData(_payload: PlatformPayload): Promise<PushResult> {
    return {
      ok: false,
      transmitted: false,
      message:
        "API-Übertragung im MVP nicht aktiv. Bitte manuellen Export/Kopiermaske verwenden. (TODO: echte API anbinden)",
    };
  }

  async uploadDocuments(
    _caseId: string,
    documents: PlatformDocument[]
  ): Promise<UploadResult> {
    return {
      ok: false,
      uploaded: 0,
      message: `Dokumenten-Upload-Stub: ${documents.length} Dokument(e) vorbereitet, aber nicht übertragen (TODO: API).`,
    };
  }
}

// ---------------- Europace (höchste Priorität) ----------------
export class EuropaceConnector extends BaseConnector {
  readonly name = "europace" as const;
  protected platformKey() {
    return "europace" as const;
  }
  async isConfigured() {
    return Boolean(process.env.EUROPACE_BASE_URL && process.env.EUROPACE_CLIENT_ID && process.env.EUROPACE_CLIENT_SECRET);
  }
  async testConnection(): Promise<ConnectionStatus> {
    const ok = await this.isConfigured();
    return {
      ok,
      message: ok
        ? "Konfiguration vorhanden (OAuth/API). TODO: echten Health-Check ausführen."
        : "Europace nicht konfiguriert. EUROPACE_BASE_URL/CLIENT_ID/CLIENT_SECRET setzen.",
    };
  }
  // Vorbereitet für Vorgangsimport (Kundenangaben, Dokumente, Anforderungen).
  async importCaseById(externalId: string): Promise<ImportResult> {
    // TODO(prod): Europace-Vorgang via API laden und in internal mappen.
    return { ok: false, importedCaseIds: [], message: `Europace-Import-Stub für Vorgang ${externalId} (TODO: API).` };
  }
  async getMissingRequirements(caseId: string): Promise<RequirementResult> {
    const payload = await this.mapCaseData(caseId);
    return {
      ok: payload.missingRequiredFields.length === 0,
      missing: payload.missingRequiredFields.map((k) => ({ key: k, title: k })),
    };
  }
}

// ---------------- FinLink ----------------
export class FinLinkConnector extends BaseConnector {
  readonly name = "finlink" as const;
  protected platformKey() {
    return "finlink" as const;
  }
  async isConfigured() {
    return Boolean(process.env.FINLINK_BASE_URL && process.env.FINLINK_API_KEY);
  }
  async testConnection(): Promise<ConnectionStatus> {
    const ok = await this.isConfigured();
    return {
      ok,
      message: ok
        ? "FinLink-Konfiguration vorhanden (API-Key/Base URL). TODO: Health-Check."
        : "FinLink nicht konfiguriert. FINLINK_BASE_URL/FINLINK_API_KEY setzen.",
    };
  }
  // Import von Fällen/Kunden vorbereiten.
  async importCases(): Promise<ImportResult> {
    // TODO(prod): FinLink-Fälle abrufen und übernehmen.
    return { ok: false, importedCaseIds: [], message: "FinLink-Import-Stub (TODO: API-Key + Endpunkt)." };
  }
  async importCaseById(
    externalId: string,
    ctx: { organizationId: string; userId: string },
    deps?: { client?: FinLinkClient | null }
  ): Promise<ImportResult> {
    const client = deps && "client" in deps ? deps.client : getFinLinkClient();
    if (!client) {
      return { ok: false, importedCaseIds: [], message: "FinLink ist nicht verbunden. Bitte FINLINK_BASE_URL/FINLINK_API_KEY setzen." };
    }
    try {
      const dto = await client.fetchVorgang(externalId);
      const canonical = finlinkToCanonical(dto);
      const { caseId, deduped } = await createCaseFromCanonical(ctx, canonical);
      return {
        ok: true,
        importedCaseIds: [caseId],
        message: deduped ? "Vorgang bereits importiert – bestehender Fall geöffnet." : "FinLink-Vorgang übernommen.",
      };
    } catch (e) {
      if (e instanceof FinLinkNotFoundError) return { ok: false, importedCaseIds: [], message: "FinLink-Vorgang nicht gefunden. Bitte ID prüfen." };
      if (e instanceof FinLinkAuthError) return { ok: false, importedCaseIds: [], message: "FinLink-Zugang abgelehnt. Bitte API-Key prüfen." };
      return { ok: false, importedCaseIds: [], message: "FinLink-Import fehlgeschlagen. Bitte später erneut versuchen." };
    }
  }
}

// ---------------- eHyp home ----------------
export class EHypHomeConnector extends BaseConnector {
  readonly name = "ehyp_home" as const;
  protected platformKey() {
    return "ehyp_home" as const;
  }
  async isConfigured() {
    return Boolean(
      process.env.EHYP_BASE_URL &&
        process.env.EHYP_API_KEY &&
        process.env.EHYP_CLIENT_ID &&
        process.env.EHYP_CLIENT_SECRET &&
        process.env.EHYP_COMPANY_ID
    );
  }
  async testConnection(): Promise<ConnectionStatus> {
    const ok = await this.isConfigured();
    return {
      ok,
      message: ok
        ? "eHyp-home-Konfiguration vorhanden (Developer Studio). TODO: Health-Check."
        : "eHyp home nicht konfiguriert. EHYP_API_KEY/CLIENT_ID/CLIENT_SECRET/COMPANY_ID setzen.",
    };
  }
  // Keine unbekannten Endpunkte hardcoden – reiner Stub.
  async importCaseById(externalId: string): Promise<ImportResult> {
    return { ok: false, importedCaseIds: [], message: `eHyp-home-Import-Stub für ${externalId} (TODO: Developer-Studio-API).` };
  }
}

// ---------------- Manueller Export ----------------
export class ManualExportConnector extends BaseConnector {
  readonly name = "manual" as const;
  protected platformKey() {
    return "europace" as const; // Default; tatsächliche Plattform via mapForPlatform.
  }
  async isConfigured() {
    return true;
  }
  async testConnection(): Promise<ConnectionStatus> {
    return { ok: true, message: "Manueller Export immer verfügbar (PDF, JSON, CSV, Kopiermaske)." };
  }
  // Manueller Export ist die produktive MVP-Variante.
  async pushCaseData(): Promise<PushResult> {
    return { ok: true, transmitted: false, message: "Daten für manuellen Export/Kopiermaske vorbereitet." };
  }
}

// ---------------- Browser-Assist (späterer optionaler Fallback) ----------------
export class BrowserAssistConnector {
  readonly name = "browser-assist" as const;
  // Bewusst KEINE Implementierung. Nur Konzept/Stub. Kein heimliches Scraping.
  async isConfigured() {
    return false;
  }
  async testConnection(): Promise<ConnectionStatus> {
    return {
      ok: false,
      message:
        "Browser-Assist ist nur als späterer, optionaler manueller Assistenz-Fallback konzipiert – im MVP deaktiviert.",
    };
  }
}

const REGISTRY = {
  europace: new EuropaceConnector(),
  finlink: new FinLinkConnector(),
  ehyp_home: new EHypHomeConnector(),
} as const;

export function getConnector(
  platform: "europace" | "finlink" | "ehyp_home"
): PlatformConnector {
  return REGISTRY[platform];
}

export const manualExport = new ManualExportConnector();
export const browserAssist = new BrowserAssistConnector();

// Bequemer Zugriff für UI-Statusanzeige
export async function connectionStatuses(_organizationId: string) {
  void prisma;
  void getEnv;
  return Promise.all(
    (Object.keys(REGISTRY) as Array<keyof typeof REGISTRY>).map(async (k) => ({
      platform: k,
      ...(await REGISTRY[k].testConnection()),
    }))
  );
}
