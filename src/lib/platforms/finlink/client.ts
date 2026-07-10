import { parseFinLinkVorgang, type FinLinkVorgangDTO } from "./dto";

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
 * HTTP-Anbindung an die FinLink-API.
 *
 * PROVISORISCH: Endpunktpfad und Auth-Schema sind eine Annahme, bis die
 * FinLink-Doku vorliegt. Anzupassen sind später NUR:
 *   - VORGANG_PATH (Endpunkt zum Abruf eines Vorgangs per ID)
 *   - der Auth-Header (aktuell `Authorization: Bearer <key>`)
 * Die Fehlerklassifizierung und DTO-Validierung bleiben unverändert.
 */
const VORGANG_PATH = (id: string) => `/vorgaenge/${encodeURIComponent(id)}`;

export class HttpFinLinkClient implements FinLinkClient {
  constructor(private readonly config: FinLinkConfig, private readonly fetchImpl: FetchLike = fetch) {}

  async fetchVorgang(externalId: string): Promise<FinLinkVorgangDTO> {
    const url = new URL(VORGANG_PATH(externalId), this.config.baseUrl);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json" },
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
    try {
      return parseFinLinkVorgang(body);
    } catch {
      throw new FinLinkApiError("FinLink-Antwort hat ein unerwartetes Format.");
    }
  }
}

/**
 * Baut den Client aus der Umgebung. Gibt null zurück, wenn FinLink nicht
 * konfiguriert ist (FINLINK_BASE_URL / FINLINK_API_KEY fehlen).
 */
export function getFinLinkClient(fetchImpl: FetchLike = fetch): FinLinkClient | null {
  const baseUrl = process.env.FINLINK_BASE_URL;
  const apiKey = process.env.FINLINK_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return new HttpFinLinkClient({ baseUrl, apiKey }, fetchImpl);
}
