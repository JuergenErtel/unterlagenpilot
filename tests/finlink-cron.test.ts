import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getEnv: vi.fn(),
  sync: vi.fn(),
  organizationFindMany: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getEnv: () => h.getEnv() }));
vi.mock("@/lib/platforms/finlink/sync", () => ({ syncFinLinkLeads: h.sync }));
vi.mock("@/lib/db", () => ({
  prisma: { organization: { findMany: h.organizationFindMany } },
}));

import { GET } from "@/app/api/cron/finlink-leads/route";

function anfrage(header?: string) {
  return new Request("https://baufidesk.de/api/cron/finlink-leads", {
    headers: header ? { authorization: header } : {},
  });
}

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  h.getEnv.mockReturnValue({ CRON_SECRET: "geheim" });
  h.organizationFindMany.mockResolvedValue([{ id: "org-A" }]);
  h.sync.mockResolvedValue({ status: "ok", angelegt: 2, uebersprungen: [] });
});

describe("Cron /api/cron/finlink-leads", () => {
  it("weist eine Anfrage ohne Geheimnis mit 401 ab", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage() as any);
    expect(res.status).toBe(401);
    expect(h.sync).not.toHaveBeenCalled();
  });

  it("weist ein falsches Geheimnis ab", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer falsch") as any);
    expect(res.status).toBe(401);
    expect(h.sync).not.toHaveBeenCalled();
  });

  it("antwortet 503, wenn CRON_SECRET gar nicht gesetzt ist", async () => {
    h.getEnv.mockReturnValue({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(503);
  });

  it("gleicht jede Organisation ab und meldet die Summe", async () => {
    h.organizationFindMany.mockResolvedValue([{ id: "org-A" }, { id: "org-B" }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(200);
    expect(h.sync).toHaveBeenCalledTimes(2);
    const body = await res.json();
    expect(body.angelegt).toBe(4);
  });

  it("lässt einen Fehler in einer Organisation die anderen nicht kippen", async () => {
    h.organizationFindMany.mockResolvedValue([{ id: "org-A" }, { id: "org-B" }]);
    h.sync.mockImplementation(async (ctx: { organizationId: string }) => {
      if (ctx.organizationId === "org-A") throw new Error("kaputt");
      return { status: "ok", angelegt: 1, uebersprungen: [] };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.angelegt).toBe(1);
    expect(body.fehler).toBe(1);
  });
});
