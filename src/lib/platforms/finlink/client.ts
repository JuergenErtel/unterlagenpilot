import {
  mergeAntragstellerDetails,
  parseFinLinkApplicantsResponse,
  parseFinLinkLeadLoanApplicationIds,
  parseFinLinkLeadQuelle,
  parseFinLinkLeadsRoh,
  parseFinLinkLeadsSummaries,
  parseFinLinkSalesStates,
  parseFinLinkSingleLeadResponse,
  type FinLinkLeadRoh,
  type FinLinkLeadSummary,
  type FinLinkVorgangDTO,
} from "./dto";

export class FinLinkNotConfiguredError extends Error {}
export class FinLinkNotFoundError extends Error {}
export class FinLinkAuthError extends Error {}
export class FinLinkApiError extends Error {}

export interface FinLinkClient {
  fetchVorgang(externalId: string): Promise<FinLinkVorgangDTO>;
  listLeads(): Promise<FinLinkLeadSummary[]>;
  /** Nur die neueste Seite – der Abgleich braucht nicht alle Seiten. */
  fetchLeadsPage(limit: number): Promise<FinLinkLeadRoh[]>;
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
 * Auth: `X-API-Key`-Header. Einzelabruf über GET /leads/{id}; die Liste über
 * GET /leads (paginiert via limit/page, absteigend nach Eingangsdatum) plus
 * GET /loan_applications für den Vertriebsstatus (active/lost/won/on_hold).
 */
const LEADS_PATH = "/leads";
const LOAN_APPLICATIONS_PATH = "/loan_applications";
/**
 * Seitengrößen nach gemessenem API-Verhalten (04.08.2026, 905 Leads):
 * /leads verkraftet große Seiten (500 ≈ 2 s), /loan_applications ist träge
 * (100 ≈ 7,5 s; limit=1000 läuft in einen Server-Timeout) – dafür verträgt
 * der Server parallele Seitenabrufe (10 Seiten ≈ 12 s statt 75 s).
 */
const LEADS_PAGE_LIMIT = 500;
const LOAN_APPS_PAGE_LIMIT = 100;
/** Seiten pro Parallel-Welle. */
const WAVE_SIZE = 10;
/** Sicherheitsgrenze gegen Endlosschleifen bei unerwartetem API-Verhalten. */
const MAX_PAGES = 100;
/** Next.js-Datencache für Listenabrufe; der Import selbst bleibt ungecacht. */
const LIST_CACHE_SECONDS = 120;

export class HttpFinLinkClient implements FinLinkClient {
  constructor(private readonly config: FinLinkConfig, private readonly fetchImpl: FetchLike = fetch) {}

  /** GET auf einen API-Pfad; Fehler-Mapping für alle Aufrufer gleich. */
  private async fetchJson(path: string, cacheSeconds?: number): Promise<unknown> {
    const url = `${this.config.baseUrl.replace(/\/$/, "")}${path}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        headers: { "X-API-Key": this.config.apiKey, Accept: "application/json" },
        // Unter Next.js aktiviert das den Datencache; andere Runtimes ignorieren den Key.
        ...(cacheSeconds ? { next: { revalidate: cacheSeconds } } : {}),
      } as RequestInit);
    } catch {
      // Netzwerk/Timeout – KEINE Details/Key durchreichen.
      throw new FinLinkApiError("FinLink nicht erreichbar (Netzwerkfehler).");
    }

    if (!res.ok) {
      // Diagnose ohne Key/PII – landet in den Runtime-Logs.
      console.warn(`[finlink] GET ${path.split("?")[0]} -> HTTP ${res.status}`);
    }
    if (res.status === 404) throw new FinLinkNotFoundError("FinLink-Vorgang nicht gefunden.");
    if (res.status === 401 || res.status === 403) throw new FinLinkAuthError("FinLink-Zugang abgelehnt (Auth).");
    if (!res.ok) throw new FinLinkApiError(`FinLink-Fehler (HTTP ${res.status}).`);

    try {
      return await res.json();
    } catch {
      throw new FinLinkApiError("FinLink-Antwort war kein gültiges JSON.");
    }
  }

  /**
   * Holt alle Seiten eines Listen-Endpunkts in Parallel-Wellen und parst sie
   * einzeln. Abbruch, sobald eine Seite weniger Roh-Einträge als das Limit
   * liefert (Parser dürfen Einträge herausfiltern, daher zählt `data.length`,
   * nicht das Parse-Ergebnis).
   */
  private async fetchAllPages<T>(path: string, limit: number, parsePage: (body: unknown) => T[]): Promise<T[]> {
    const all: T[] = [];
    for (let first = 1; first <= MAX_PAGES; first += WAVE_SIZE) {
      const pages = Array.from({ length: Math.min(WAVE_SIZE, MAX_PAGES - first + 1) }, (_, i) => first + i);
      const bodies = await Promise.all(
        pages.map((p) => this.fetchJson(`${path}?limit=${limit}&page=${p}`, LIST_CACHE_SECONDS))
      );
      let sawShortPage = false;
      for (const body of bodies) {
        let items: T[];
        try {
          items = parsePage(body);
        } catch (e) {
          console.warn(`[finlink] ${path}-Antwort unparsebar: ${e instanceof Error ? e.message : String(e)}`);
          throw new FinLinkApiError("FinLink-Antwort hat ein unerwartetes Format.");
        }
        all.push(...items);
        const raw = (body as { data?: unknown[] })?.data;
        const rawCount = Array.isArray(raw) ? raw.length : items.length;
        if (rawCount < limit) {
          sawShortPage = true;
          break;
        }
      }
      if (sawShortPage) break;
    }
    return all;
  }

  async listLeads(): Promise<FinLinkLeadSummary[]> {
    const [summaries, stateEntries] = await Promise.all([
      this.fetchAllPages(LEADS_PATH, LEADS_PAGE_LIMIT, parseFinLinkLeadsSummaries),
      this.fetchAllPages(LOAN_APPLICATIONS_PATH, LOAN_APPS_PAGE_LIMIT, parseFinLinkSalesStates),
    ]);
    // Hat ein Lead mehrere Anträge, gewinnt „active“, sonst der zuletzt gesehene.
    const salesStates = new Map<string, string>();
    for (const { leadId, salesState } of stateEntries) {
      if (salesStates.get(leadId) === "active") continue;
      salesStates.set(leadId, salesState);
    }
    return summaries.map((s) => ({ ...s, salesState: salesStates.get(s.id) }));
  }

  async fetchLeadsPage(limit: number): Promise<FinLinkLeadRoh[]> {
    // Eine Seite genügt: Die Liste kommt absteigend nach Eingang, und der
    // Abgleich interessiert sich nur für das Neue.
    const body = await this.fetchJson(`${LEADS_PATH}?limit=${limit}&page=1`);
    return parseFinLinkLeadsRoh(body);
  }

  async fetchVorgang(externalId: string): Promise<FinLinkVorgangDTO> {
    const body = await this.fetchJson(`${LEADS_PATH}/${encodeURIComponent(externalId)}`);
    let dto: FinLinkVorgangDTO;
    try {
      dto = parseFinLinkSingleLeadResponse(body);
    } catch (e) {
      console.warn(`[finlink] /leads/{id}-Antwort unparsebar: ${e instanceof Error ? e.message : String(e)}`);
      throw new FinLinkApiError("FinLink-Antwort hat ein unerwartetes Format.");
    }

    // Herkunft aus derselben Antwort mitnehmen. Muss VOR den Rückgaben unten
    // stehen: mergeAntragstellerDetails spreizt das DTO, trägt sie also weiter.
    dto.quelle = parseFinLinkLeadQuelle(body);

    // Anreicherung: /loan_applications/{id}/applicants liefert Geburtsdatum,
    // E-Mail, Familienstand, Kinder UND Mit-Antragsteller, die am Lead fehlen.
    // Schlägt das fehl, bleibt der Lead-Stand – der Import scheitert daran nie.
    for (const laId of parseFinLinkLeadLoanApplicationIds(body).slice(0, 3)) {
      try {
        const apBody = await this.fetchJson(
          `${LOAN_APPLICATIONS_PATH}/${encodeURIComponent(laId)}/applicants`
        );
        const detailed = parseFinLinkApplicantsResponse(apBody);
        if (detailed.length > 0) return mergeAntragstellerDetails(dto, detailed);
      } catch (e) {
        console.warn(
          `[finlink] Antragsteller-Detailabruf für Antrag ${laId} fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
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
