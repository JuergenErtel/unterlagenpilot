import { parseFinLinkLeadsResponse, type FinLinkVorgangDTO } from "./dto";

export class FinLinkNotConfiguredError extends Error {}
export class FinLinkNotFoundError extends Error {}
export class FinLinkAuthError extends Error {}
export class FinLinkApiError extends Error {}

export interface FinLinkClient {
  fetchVorgang(externalId: string): Promise<FinLinkVorgangDTO>;
}

interface FinLinkConfig {
  baseUrl: string;
  apiKey: string;
}

type FetchLike = typeof fetch;

/**
 * HTTP-Anbindung an die FinLink Partner-API
 * (https://api.finlink.de/partner-api/docs/redoc).
 *
 * Auth: `X-API-Key`-Header. Die API bietet keinen Einzel-Abruf per ID –
 * es wird die Lead-Liste unter /leads geholt und der Vorgang darin gesucht.
 */
const LEADS_PATH = "/leads";

export class HttpFinLinkClient implements FinLinkClient {
  constructor(private readonly config: FinLinkConfig, private readonly fetchImpl: FetchLike = fetch) {}

  async fetchVorgang(externalId: string): Promise<FinLinkVorgangDTO> {
    const url = `${this.config.baseUrl.replace(/\/$/, "")}${LEADS_PATH}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        headers: { "X-API-Key": this.config.apiKey, Accept: "application/json" },
      });
    } catch {
      // Netzwerk/Timeout – KEINE Details/Key durchreichen.
      throw new FinLinkApiError("FinLink nicht erreichbar (Netzwerkfehler).");
    }

    if (res.status === 404) throw new FinLinkNotFoundError("FinLink-Vorgang nicht gefunden.");
    if (res.status === 401 || res.status === 403) throw new FinLinkAuthError("FinLink-Zugang abgelehnt (Auth).");
    if (!res.ok) throw new FinLinkApiError(`FinLink-Fehler (HTTP ${res.status}).`);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new FinLinkApiError("FinLink-Antwort war kein gültiges JSON.");
    }
    let dto: FinLinkVorgangDTO | null;
    try {
      dto = parseFinLinkLeadsResponse(body, externalId);
    } catch {
      throw new FinLinkApiError("FinLink-Antwort hat ein unerwartetes Format.");
    }
    if (!dto) throw new FinLinkNotFoundError("FinLink-Vorgang nicht gefunden.");
    return dto;
  }
}

const DEFAULT_BASE_URL = "https://api.finlink.de/partner-api";

/**
 * Baut den Client aus der Umgebung. Gibt null zurück, wenn FinLink nicht
 * konfiguriert ist (FINLINK_API_KEY fehlt); FINLINK_BASE_URL ist optional
 * und übersteuert nur die Standard-Partner-API-URL.
 */
export function getFinLinkClient(fetchImpl: FetchLike = fetch): FinLinkClient | null {
  const apiKey = process.env.FINLINK_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.FINLINK_BASE_URL || DEFAULT_BASE_URL;
  return new HttpFinLinkClient({ baseUrl, apiKey }, fetchImpl);
}
