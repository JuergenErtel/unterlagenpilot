import { describe, it, expect, vi, afterEach } from "vitest";
import {
  HttpFinLinkClient,
  FinLinkNotFoundError,
  FinLinkAuthError,
  FinLinkApiError,
} from "@/lib/platforms/finlink/client";
import { FinLinkConnector } from "@/lib/platforms/connectors";
import type { FinLinkClient } from "@/lib/platforms/finlink/client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

/** Minimaler JSON:API-Lead, wie ihn die Partner-API unter /leads liefert. */
function apiLeadBody(id: string) {
  return {
    data: [
      {
        id,
        type: "lead",
        attributes: {
          applicant_meta: { first_name: "Anna", last_name: "Muster" },
          user_meta: {},
          property_meta: {},
          loan_application_meta: {},
          extras_meta: {},
          imported: false,
          external_id: null,
          contact_id: null,
          created_at: "2026-07-01T10:00:00Z",
          updated_at: "2026-07-01T10:00:00Z",
        },
        relationships: { advisor: { data: null }, contact: { data: null }, loan_applications: { data: [] } },
      },
    ],
  };
}

/** Einzel-Lead-Antwort von GET /leads/{id}. */
function apiSingleLeadBody(id: string) {
  return { data: apiLeadBody(id).data[0] };
}

/** fetch-Mock, der je nach URL unterschiedliche Antworten liefert. */
function mockFetchRouting(routes: Array<[RegExp, { status: number; body: unknown }]>) {
  return vi.fn().mockImplementation(async (url: string) => {
    const hit = routes.find(([re]) => re.test(String(url)));
    const { status, body } = hit ? hit[1] : { status: 404, body: {} };
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  });
}

afterEach(() => vi.restoreAllMocks());

describe("HttpFinLinkClient.fetchVorgang", () => {
  it("ruft /leads/{id} mit X-API-Key auf", async () => {
    const fetchMock = mockFetch(200, apiSingleLeadBody("FL-1"));
    const client = new HttpFinLinkClient({ baseUrl: "https://api.finlink.test/partner-api", apiKey: "secret" }, fetchMock);
    const dto = await client.fetchVorgang("FL-1");
    expect(dto.id).toBe("FL-1");
    expect(dto.antragsteller[0]?.vorname).toBe("Anna");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.finlink.test/partner-api/leads/FL-1");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("secret");
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  it("reichert Antragsteller über /loan_applications/{id}/applicants an", async () => {
    const leadBody = apiSingleLeadBody("FL-1") as any;
    leadBody.data.relationships = { loan_applications: { data: [{ id: "LA-7" }] } };
    const applicants = {
      data: [
        { attributes: { first_name: "Anna", last_name: "Muster", dob: "1990-04-29T00:00:00.000+02:00" } },
        { attributes: { first_name: "Ben", last_name: "Muster", dob: "1989-10-24T00:00:00.000+01:00" } },
      ],
    };
    const fetchMock = mockFetchRouting([
      [/\/loan_applications\/LA-7\/applicants$/, { status: 200, body: applicants }],
      [/\/leads\/FL-1$/, { status: 200, body: leadBody }],
    ]);
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, fetchMock);
    const dto = await client.fetchVorgang("FL-1");
    expect(dto.antragsteller).toHaveLength(2);
    expect(dto.antragsteller[0]?.geburtsdatum).toBe("1990-04-29");
    expect(dto.antragsteller[1]?.vorname).toBe("Ben");
  });

  it("fällt auf Lead-Daten zurück, wenn der Antragsteller-Detailabruf scheitert", async () => {
    const leadBody = apiSingleLeadBody("FL-1") as any;
    leadBody.data.relationships = { loan_applications: { data: [{ id: "LA-7" }] } };
    const fetchMock = mockFetchRouting([
      [/\/loan_applications\/LA-7\/applicants$/, { status: 500, body: {} }],
      [/\/leads\/FL-1$/, { status: 200, body: leadBody }],
    ]);
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, fetchMock);
    const dto = await client.fetchVorgang("FL-1");
    expect(dto.antragsteller[0]?.vorname).toBe("Anna");
    expect(dto.antragsteller).toHaveLength(1);
  });

  it("wirft FinLinkNotFoundError bei 404 (unbekannte ID)", async () => {
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, mockFetch(404, {}));
    await expect(client.fetchVorgang("nope")).rejects.toBeInstanceOf(FinLinkNotFoundError);
  });

  it("wirft FinLinkAuthError bei 401/403", async () => {
    const c401 = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, mockFetch(401, {}));
    await expect(c401.fetchVorgang("x")).rejects.toBeInstanceOf(FinLinkAuthError);
  });

  it("wirft FinLinkApiError bei unerwartetem Schema", async () => {
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, mockFetch(200, { unerwartet: true }));
    await expect(client.fetchVorgang("x")).rejects.toBeInstanceOf(FinLinkApiError);
  });

  it("braucht nur FINLINK_API_KEY – Base-URL hat die Partner-API als Default", async () => {
    const { getFinLinkClient } = await import("@/lib/platforms/finlink/client");
    const prevKey = process.env.FINLINK_API_KEY;
    const prevUrl = process.env.FINLINK_BASE_URL;
    process.env.FINLINK_API_KEY = "k";
    delete process.env.FINLINK_BASE_URL;
    try {
      const fetchMock = mockFetch(200, apiSingleLeadBody("FL-9"));
      const client = getFinLinkClient(fetchMock);
      expect(client).not.toBeNull();
      await client!.fetchVorgang("FL-9");
      expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.finlink.de/partner-api/leads/FL-9");
    } finally {
      if (prevKey === undefined) delete process.env.FINLINK_API_KEY;
      else process.env.FINLINK_API_KEY = prevKey;
      if (prevUrl !== undefined) process.env.FINLINK_BASE_URL = prevUrl;
    }
  });

  it("leakt den API-Key nicht in Fehlermeldungen", async () => {
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "supersecret" }, mockFetch(500, {}));
    const err = (await client.fetchVorgang("x").catch((e) => e)) as Error;
    expect(err.message).not.toContain("supersecret");
  });
});

describe("HttpFinLinkClient.listLeads", () => {
  it("liefert Anzeige-Zusammenfassungen inkl. Vertriebsstatus aus /loan_applications", async () => {
    const body = apiLeadBody("FL-1");
    (body.data[0]!.attributes as any).property_meta = { city_name: "Wörth", listed_price: "850000.0" };
    (body.data[0]!.attributes as any).loan_application_meta = { finance_type: "buy_existing" };
    const loanApps = {
      data: [
        { attributes: { sales_state: "active" }, relationships: { lead: { data: { id: "FL-1" } } } },
      ],
    };
    const fetchMock = mockFetchRouting([
      [/\/loan_applications\?/, { status: 200, body: loanApps }],
      [/\/leads\?/, { status: 200, body }],
    ]);
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, fetchMock);
    const leads = await client.listLeads();
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      id: "FL-1",
      vorname: "Anna",
      nachname: "Muster",
      objektOrt: "Wörth",
      kaufpreis: 850000,
      finanzierungsart: "kauf",
      createdAt: "2026-07-01T10:00:00Z",
      salesState: "active",
    });
  });

  it("bei mehreren Anträgen eines Leads gewinnt „active“", async () => {
    const loanApps = {
      data: [
        { attributes: { sales_state: "lost" }, relationships: { lead: { data: { id: "FL-1" } } } },
        { attributes: { sales_state: "active" }, relationships: { lead: { data: { id: "FL-1" } } } },
        { attributes: { sales_state: "lost" }, relationships: { lead: { data: { id: "FL-1" } } } },
      ],
    };
    const fetchMock = mockFetchRouting([
      [/\/loan_applications\?/, { status: 200, body: loanApps }],
      [/\/leads\?/, { status: 200, body: apiLeadBody("FL-1") }],
    ]);
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, fetchMock);
    const leads = await client.listLeads();
    expect(leads[0]?.salesState).toBe("active");
  });

  it("Leads ohne Antrag bekommen keinen Vertriebsstatus", async () => {
    const fetchMock = mockFetchRouting([
      [/\/loan_applications\?/, { status: 200, body: { data: [] } }],
      [/\/leads\?/, { status: 200, body: apiLeadBody("FL-2") }],
    ]);
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, fetchMock);
    const leads = await client.listLeads();
    expect(leads[0]?.salesState).toBeUndefined();
  });

  it("mappt 401 auf FinLinkAuthError", async () => {
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, mockFetch(401, {}));
    await expect(client.listLeads()).rejects.toBeInstanceOf(FinLinkAuthError);
  });

  it("wirft FinLinkApiError bei unerwartetem Format", async () => {
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, mockFetch(200, { kaputt: true }));
    await expect(client.listLeads()).rejects.toBeInstanceOf(FinLinkApiError);
  });
});

vi.mock("@/lib/platforms/case-writer", () => ({
  createCaseFromCanonical: vi.fn(async (_ctx, canonical) => ({
    caseId: "case-123",
    caseNumber: "UP-2026-0001",
    deduped: Boolean((canonical as any).__dedup),
  })),
}));

const ctx = { organizationId: "org-1", userId: "user-1" };

function clientReturning(dto: any): FinLinkClient {
  return {
    fetchVorgang: vi.fn().mockResolvedValue(dto),
    listLeads: vi.fn().mockResolvedValue([]),
    fetchLeadsPage: vi.fn().mockResolvedValue([]),
  };
}

describe("FinLinkConnector.importCaseById", () => {
  it("importiert und liefert die neue caseId", async () => {
    const connector = new FinLinkConnector();
    const client = clientReturning({ id: "FL-1", antragsteller: [{ vorname: "Anna" }] });
    const res = await connector.importCaseById("FL-1", ctx, { client });
    expect(res.ok).toBe(true);
    expect(res.importedCaseIds).toEqual(["case-123"]);
  });

  it("meldet 'nicht konfiguriert', wenn kein Client vorhanden ist", async () => {
    const connector = new FinLinkConnector();
    const res = await connector.importCaseById("FL-1", ctx, { client: null });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/nicht (verbunden|konfiguriert)/i);
  });

  it("meldet eine klare Fehlermeldung bei unbekanntem Vorgang (404)", async () => {
    const { FinLinkNotFoundError } = await import("@/lib/platforms/finlink/client");
    const connector = new FinLinkConnector();
    const client: FinLinkClient = {
      fetchVorgang: vi.fn().mockRejectedValue(new FinLinkNotFoundError("x")),
      listLeads: vi.fn().mockResolvedValue([]),
      fetchLeadsPage: vi.fn().mockResolvedValue([]),
    };
    const res = await connector.importCaseById("nope", ctx, { client });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/nicht gefunden/i);
  });
});
