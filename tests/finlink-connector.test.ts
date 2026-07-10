import { describe, it, expect, vi, afterEach } from "vitest";
import {
  HttpFinLinkClient,
  FinLinkNotFoundError,
  FinLinkAuthError,
  FinLinkApiError,
} from "@/lib/platforms/finlink/client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

const validBody = { id: "FL-1", antragsteller: [{ vorname: "Anna" }] };

afterEach(() => vi.restoreAllMocks());

describe("HttpFinLinkClient.fetchVorgang", () => {
  it("sendet Auth-Header + Base-URL und validiert die Antwort", async () => {
    const fetchMock = mockFetch(200, validBody);
    const client = new HttpFinLinkClient({ baseUrl: "https://api.finlink.test", apiKey: "secret" }, fetchMock);
    const dto = await client.fetchVorgang("FL-1");
    expect(dto.id).toBe("FL-1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://api.finlink.test");
    expect(String(url)).toContain("FL-1");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer secret");
  });

  it("wirft FinLinkNotFoundError bei 404", async () => {
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

  it("leakt den API-Key nicht in Fehlermeldungen", async () => {
    const client = new HttpFinLinkClient({ baseUrl: "https://x", apiKey: "supersecret" }, mockFetch(500, {}));
    const err = (await client.fetchVorgang("x").catch((e) => e)) as Error;
    expect(err.message).not.toContain("supersecret");
  });
});
