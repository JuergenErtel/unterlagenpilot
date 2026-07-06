import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getEnv = vi.fn();
vi.mock("@/lib/env", () => ({ getEnv: () => getEnv() }));

import { CloudmersiveVirusScanner } from "@/lib/security/virus-scan";

const input = { buffer: Buffer.from("hello world"), filename: "a.pdf", mimeType: "application/pdf" };

function mockFetch(status: number, json: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  }));
}

beforeEach(() => {
  getEnv.mockReset();
  getEnv.mockReturnValue({ CLOUDMERSIVE_API_KEY: "key-123" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CloudmersiveVirusScanner", () => {
  it("meldet eine saubere Datei als clean", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { CleanResult: true }));
    const r = await new CloudmersiveVirusScanner().scan(input);
    expect(r.verdict).toBe("clean");
    expect(r.demo).toBe(false);
  });

  it("meldet einen Fund als infected mit Signatur", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { CleanResult: false, FoundViruses: [{ VirusName: "Eicar-Test-Signature" }] }));
    const r = await new CloudmersiveVirusScanner().scan(input);
    expect(r.verdict).toBe("infected");
    expect(r.signature).toBe("Eicar-Test-Signature");
  });

  it("fällt bei HTTP-Fehler fail-closed auf error (Quarantäne)", async () => {
    vi.stubGlobal("fetch", mockFetch(500, { error: "boom" }));
    const r = await new CloudmersiveVirusScanner().scan(input);
    expect(r.verdict).toBe("error");
  });

  it("ohne API-Key: error und kein Netzwerkaufruf", async () => {
    getEnv.mockReturnValue({ CLOUDMERSIVE_API_KEY: undefined });
    const f = mockFetch(200, { CleanResult: true });
    vi.stubGlobal("fetch", f);
    const r = await new CloudmersiveVirusScanner().scan(input);
    expect(r.verdict).toBe("error");
    expect(f).not.toHaveBeenCalled();
  });
});
