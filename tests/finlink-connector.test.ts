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

afterEach(() => vi.restoreAllMocks());

describe("HttpFinLinkClient.fetchVorgang", () => {
  it("ruft /leads mit X-API-Key auf und findet den Vorgang per ID", async () => {
    const fetchMock = mockFetch(200, apiLeadBody("FL-1"));
    const client = new HttpFinLinkClient({ baseUrl: "https://api.finlink.test/partner-api", apiKey: "secret" }, fetchMock);
    const dto = await client.fetchVorgang("FL-1");
    expect(dto.id).toBe("FL-1");
    expect(dto.antragsteller[0]?.vorname).toBe("Anna");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.finlink.test/partner-api/leads");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("secret");
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  it("wirft FinLinkNotFoundError bei 404", async () => {
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, mockFetch(404, {}));
    await expect(client.fetchVorgang("nope")).rejects.toBeInstanceOf(FinLinkNotFoundError);
  });

  it("wirft FinLinkNotFoundError, wenn die ID nicht in der Lead-Liste ist", async () => {
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, mockFetch(200, apiLeadBody("ANDERE-ID")));
    await expect(client.fetchVorgang("FL-1")).rejects.toBeInstanceOf(FinLinkNotFoundError);
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
      const fetchMock = mockFetch(200, apiLeadBody("FL-9"));
      const client = getFinLinkClient(fetchMock);
      expect(client).not.toBeNull();
      await client!.fetchVorgang("FL-9");
      expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.finlink.de/partner-api/leads");
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
  it("liefert Anzeige-Zusammenfassungen aller Leads", async () => {
    const body = apiLeadBody("FL-1");
    (body.data[0]!.attributes as any).property_meta = { city_name: "Wörth", listed_price: "850000.0" };
    (body.data[0]!.attributes as any).loan_application_meta = { finance_type: "buy_existing" };
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "k" }, mockFetch(200, body));
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
    });
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
  return { fetchVorgang: vi.fn().mockResolvedValue(dto), listLeads: vi.fn().mockResolvedValue([]) };
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
    };
    const res = await connector.importCaseById("nope", ctx, { client });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/nicht gefunden/i);
  });
});
