import { fetchWithRateLimitRetry } from "@/lib/ai/http";
import type {
  Datenkontext,
  EuropaceAntrag,
  EuropaceFinanzierungsvorschlag,
  EuropaceKundenangabenRequest,
  Unterlagenanforderung,
} from "./types";

export class EuropaceNotConfiguredError extends Error {}
export class EuropaceAuthError extends Error {}
export class EuropaceApiError extends Error {}

/** Traegt die Feldmeldungen von Europace, damit die UI sie einzeln zeigen kann. */
export class EuropaceValidationError extends Error {
  constructor(readonly meldungen: string[]) {
    super("Europace hat die Kundenangaben abgelehnt.");
  }
}

const TOKEN_URL = "https://api.europace.de/auth/token";
const BAUFI_HOST = "https://baufinanzierung.api.europace.de";
const UNTERLAGEN_HOST = "https://api.europace2.de";

/** Token laeuft nach 3600 s ab; wir erneuern es eine Minute vorher. */
const TOKEN_PUFFER_MS = 60_000;
/** Exportiert, damit Aufrufer (z. B. die Beanspruchung in uebertragung.ts) ihre
 *  eigenen Zeitfenster an der tatsaechlichen Obergrenze eines Aufrufs ausrichten
 *  koennen, statt sie zu erraten. */
export const TIMEOUT_MS = 30_000;
/** Der Upload darf laenger dauern – Europace erlaubt bis 100 MB je Datei. */
const UPLOAD_TIMEOUT_MS = 120_000;

const SCOPES = [
  "baufinanzierung:vorgang:schreiben",
  "baufinanzierung:vorgang:lesen",
  "unterlagen:dokument:schreiben",
  "unterlagen:unterlage:schreiben",
  // Lesend fuer die Unterlagenanforderungen:
  //   unterlagen:unterlage:lesen  -> GET /dokumente/anforderungen
  //   unterlagen:freigabe:lesen   -> GET /dokumente/antrag/anforderungen
  // Beide muessen im Zugangsantrag bei Europace stehen, sonst kommt der Zugang,
  // aber die Anforderungen bleiben unlesbar.
  "unterlagen:unterlage:lesen",
  "unterlagen:freigabe:lesen",
].join(" ");

export interface DokumentUpload {
  vorgangsnummer: string;
  datei: Buffer;
  dateiname: string;
  mimeType: string;
  anzeigename: string;
  kategorie: string;
}

export interface EuropaceClient {
  /** Trockenlauf: prueft den Request, legt nichts an. */
  validiereKundenangaben(req: EuropaceKundenangabenRequest): Promise<void>;
  /** Legt den Vorgang an und liefert die Vorgangsnummer. */
  legeVorgangAn(req: EuropaceKundenangabenRequest): Promise<string>;
  /** Laedt ein Dokument hoch und liefert die Europace-Dokument-ID. */
  ladeDokumentHoch(input: DokumentUpload): Promise<string>;
  /** Alle Antraege zum Vorgang (verbindlich, weil bereits eingereicht). */
  holeAntraege(vorgangsNummer: string): Promise<EuropaceAntrag[]>;
  /** Alle ausgehaendigten Finanzierungsvorschlaege zum Vorgang. */
  holeFinanzierungsvorschlaege(vorgangsNummer: string): Promise<EuropaceFinanzierungsvorschlag[]>;
  /** Die Unterlagenanforderungen zu einem Antrag oder Vorschlag. */
  holeAnforderungen(p: {
    quelle: "antrag" | "vorschlag";
    vorgangsNummer: string;
    bezugsId: string;
  }): Promise<Unterlagenanforderung[]>;
}

interface EuropaceConfig {
  clientId: string;
  clientSecret: string;
}

export class HttpEuropaceClient implements EuropaceClient {
  /**
   * In-Memory-Cache fuer das Token. Das Token selbst ist laut Europace 3600 s
   * gueltig (siehe TOKEN_PUFFER_MS) -- das ist aber NICHT die tatsaechliche
   * Lebensdauer dieses Caches: `getEuropaceClient()` erzeugt pro Server-
   * Action-Aufruf eine neue Client-Instanz (kein Modul-Singleton), die mit
   * dem Ende des Aufrufs verworfen wird. In der Praxis lebt der Cache deshalb
   * nur innerhalb eines einzelnen Aufrufs -- spart hoechstens einen zweiten
   * Token-Request zwischen z. B. Trockenlauf und Anlegen, nicht stundenlang.
   */
  private token: { wert: string; gueltigBis: number } | null = null;

  constructor(
    private readonly config: EuropaceConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async holeToken(): Promise<string> {
    if (this.token && Date.now() < this.token.gueltigBis) return this.token.wert;

    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    let res: Response;
    try {
      res = await fetchWithRateLimitRetry(
        TOKEN_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPES }).toString(),
        },
        TIMEOUT_MS,
        this.fetchImpl
      );
    } catch {
      // Keine Details durchreichen – der Basic-Header darf nirgends landen.
      throw new EuropaceApiError("Europace nicht erreichbar (Netzwerkfehler).");
    }

    if (res.status === 401 || res.status === 403) {
      throw new EuropaceAuthError("Europace-Zugang abgelehnt. Bitte Client-ID und Secret pruefen.");
    }
    if (!res.ok) {
      console.warn(`[europace] Token -> HTTP ${res.status}`);
      throw new EuropaceApiError(`Europace-Token fehlgeschlagen (HTTP ${res.status}).`);
    }

    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new EuropaceApiError("Europace lieferte kein Token.");

    this.token = {
      wert: body.access_token,
      gueltigBis: Date.now() + (body.expires_in ?? 3600) * 1000 - TOKEN_PUFFER_MS,
    };
    return this.token.wert;
  }

  /** Zieht die Feldmeldungen aus einer 400-Antwort; Format variiert je Endpunkt. */
  private static meldungenAus(body: unknown): string[] {
    const eintraege =
      (body as { messages?: unknown[] })?.messages ??
      (body as { errors?: unknown[] })?.errors ??
      [];
    const gelesen = (Array.isArray(eintraege) ? eintraege : []).map((e) => {
      if (typeof e === "string") return e;
      const o = e as { path?: string; field?: string; message?: string; detail?: string };
      const pfad = o.path ?? o.field;
      const text = o.message ?? o.detail ?? JSON.stringify(e);
      return pfad ? `${pfad}: ${text}` : text;
    });
    return gelesen.length ? gelesen : ["Europace nannte keinen Grund."];
  }

  private async sendeKundenangaben(pfad: string, req: EuropaceKundenangabenRequest): Promise<Response> {
    const token = await this.holeToken();
    let res: Response;
    try {
      res = await fetchWithRateLimitRetry(
        `${BAUFI_HOST}${pfad}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json;version=1.0",
            Accept: "application/json;version=1.0",
          },
          body: JSON.stringify(req),
        },
        TIMEOUT_MS,
        this.fetchImpl
      );
    } catch {
      throw new EuropaceApiError("Europace nicht erreichbar (Netzwerkfehler).");
    }

    if (res.status === 401 || res.status === 403) {
      throw new EuropaceAuthError("Europace-Zugang abgelehnt. Bitte Scopes des API-Clients pruefen.");
    }
    if (res.status === 400) {
      throw new EuropaceValidationError(HttpEuropaceClient.meldungenAus(await res.json().catch(() => ({}))));
    }
    if (!res.ok) {
      console.warn(`[europace] POST ${pfad} -> HTTP ${res.status}`);
      throw new EuropaceApiError(`Europace antwortete mit HTTP ${res.status}.`);
    }
    return res;
  }

  async validiereKundenangaben(req: EuropaceKundenangabenRequest): Promise<void> {
    await this.sendeKundenangaben("/kundenangaben/body-validation", req);
  }

  async legeVorgangAn(req: EuropaceKundenangabenRequest): Promise<string> {
    const res = await this.sendeKundenangaben("/kundenangaben", req);
    const body = (await res.json()) as { vorgangsnummer?: string };
    if (!body.vorgangsnummer) {
      // Ohne Nummer gilt der Fall NICHT als uebertragen.
      throw new EuropaceApiError("Europace lieferte keine Vorgangsnummer.");
    }
    return body.vorgangsnummer;
  }

  async ladeDokumentHoch(input: DokumentUpload): Promise<string> {
    const token = await this.holeToken();
    const form = new FormData();
    form.append("caseId", input.vorgangsnummer);
    form.append("displayName", input.anzeigename);
    form.append("category", input.kategorie);
    form.append(
      "file",
      new Blob([new Uint8Array(input.datei)], { type: input.mimeType }),
      input.dateiname
    );

    let res: Response;
    try {
      res = await fetchWithRateLimitRetry(
        `${UNTERLAGEN_HOST}/v2/dokumente`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
        UPLOAD_TIMEOUT_MS,
        this.fetchImpl
      );
    } catch {
      throw new EuropaceApiError("Europace nicht erreichbar (Netzwerkfehler).");
    }

    if (res.status === 401 || res.status === 403) {
      throw new EuropaceAuthError("Europace-Zugang abgelehnt. Bitte Unterlagen-Scopes pruefen.");
    }
    if (!res.ok) {
      console.warn(`[europace] Dokument-Upload -> HTTP ${res.status}`);
      throw new EuropaceApiError(`Dokument-Upload fehlgeschlagen (HTTP ${res.status}).`);
    }

    const body = (await res.json()) as { id?: string; dokumentId?: string };
    const id = body.id ?? body.dokumentId;
    if (!id) throw new EuropaceApiError("Europace lieferte keine Dokument-ID.");
    return id;
  }

  /**
   * Gemeinsamer GET-Weg. Eigene Methode, weil sich die drei Leseaufrufe nur in
   * der URL unterscheiden – und damit die Fehlermeldungen an EINER Stelle
   * stehen und nicht dreimal auseinanderdriften.
   *
   * `scope` ist der Scope, der laut Europace-Spezifikation GENAU diesen
   * Endpunkt freischaltet (nicht irgendeiner der drei Lese-Scopes) – sonst
   * schickt eine 403 den Fehlersuchenden auf die falsche Fährte.
   */
  private async hole<T>(url: string, was: string, scope: string): Promise<T> {
    const token = await this.holeToken();
    let res: Response;
    try {
      res = await fetchWithRateLimitRetry(
        url,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
        TIMEOUT_MS,
        this.fetchImpl
      );
    } catch {
      throw new EuropaceApiError("Europace nicht erreichbar (Netzwerkfehler).");
    }

    if (res.status === 401 || res.status === 403) {
      throw new EuropaceAuthError(`Europace verweigert ${was}. Fehlt der Scope ${scope} im Zugang?`);
    }
    if (res.status === 404) {
      throw new EuropaceApiError(`${was}: in Europace nicht auffindbar.`);
    }
    if (!res.ok) {
      console.warn(`[europace] ${was} -> HTTP ${res.status}`);
      throw new EuropaceApiError(`${was} fehlgeschlagen (HTTP ${res.status}).`);
    }
    return (await res.json()) as T;
  }

  async holeAntraege(vorgangsNummer: string): Promise<EuropaceAntrag[]> {
    const body = await this.hole<{ antraege?: EuropaceAntrag[] } | EuropaceAntrag[]>(
      `${BAUFI_HOST}/v3/vorgaenge/${encodeURIComponent(vorgangsNummer)}/antraege`,
      `Antraege zu Vorgang ${vorgangsNummer}`,
      "baufinanzierung:vorgang:lesen"
    );
    // Die Spezifikation huellt die Antraege IMMER in ein Objekt ({ antraege: [...] });
    // die Array-Verzweigung ist rein defensiv gegen eine kuenftige Formaenderung.
    return Array.isArray(body) ? body : (body.antraege ?? []);
  }

  async holeFinanzierungsvorschlaege(
    vorgangsNummer: string
  ): Promise<EuropaceFinanzierungsvorschlag[]> {
    const body = await this.hole<
      { finanzierungsvorschlaege?: EuropaceFinanzierungsvorschlag[] } | EuropaceFinanzierungsvorschlag[]
    >(
      `${BAUFI_HOST}/v3/vorgaenge/${encodeURIComponent(vorgangsNummer)}/finanzierungsvorschlaege`,
      `Finanzierungsvorschlaege zu Vorgang ${vorgangsNummer}`,
      "baufinanzierung:vorgang:lesen"
    );
    return Array.isArray(body) ? body : (body.finanzierungsvorschlaege ?? []);
  }

  async holeAnforderungen(p: {
    quelle: "antrag" | "vorschlag";
    vorgangsNummer: string;
    bezugsId: string;
  }): Promise<Unterlagenanforderung[]> {
    const url =
      p.quelle === "antrag"
        ? `${UNTERLAGEN_HOST}/dokumente/antrag/anforderungen?antragsNummer=${encodeURIComponent(p.bezugsId)}`
        : `${UNTERLAGEN_HOST}/dokumente/anforderungen?vorgangsNummer=${encodeURIComponent(p.vorgangsNummer)}&finanzierungsvorschlagsId=${encodeURIComponent(p.bezugsId)}`;
    // Laut unterlagen-swagger.yaml traegt jede Route ihren EIGENEN Scope:
    // der Antrags-Weg unterlagen:freigabe:lesen, der Vorschlags-Weg
    // unterlagen:unterlage:lesen.
    const scope = p.quelle === "antrag" ? "unterlagen:freigabe:lesen" : "unterlagen:unterlage:lesen";

    const body = await this.hole<Unterlagenanforderung[]>(url, "Unterlagenanforderungen", scope);
    return Array.isArray(body) ? body : [];
  }
}

/**
 * Liefert den Client fuer eine Organisation. null, wenn keine Zugangsdaten
 * gesetzt sind – die UI zeigt dann den Hinweis statt eines toten Knopfes.
 *
 * `organizationId` wird im Pilotbetrieb bewusst NICHT ausgewertet: es gibt genau
 * einen Europace-Partner, dessen Zugangsdaten in der Umgebung stehen. Der
 * Parameter ist die Naht fuer den spaeteren SaaS-Betrieb, in dem jeder Vermittler
 * ein eigener Europace-Partner ist (Authorization-Code-Flow ueber einen
 * BaufiDesk-Tech-Partner-Client). Dann aendert sich nur diese Funktion.
 */
export function getEuropaceClient(
  organizationId: string,
  fetchImpl: typeof fetch = fetch
): EuropaceClient | null {
  void organizationId;
  const clientId = process.env.EUROPACE_CLIENT_ID;
  const clientSecret = process.env.EUROPACE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new HttpEuropaceClient({ clientId, clientSecret }, fetchImpl);
}

/**
 * Vorgabe ist der Testmodus. Echtgeschaeft muss ausdruecklich gesetzt werden,
 * damit niemand versehentlich echte Vorgaenge erzeugt.
 */
export function getDatenkontext(): Datenkontext {
  return process.env.EUROPACE_DATENKONTEXT === "ECHT_GESCHAEFT" ? "ECHT_GESCHAEFT" : "TEST_MODUS";
}
