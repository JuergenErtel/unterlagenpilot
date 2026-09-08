import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getEnv: vi.fn(),
  sync: vi.fn(),
  organizationFindMany: vi.fn(),
  userFindFirst: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getEnv: () => h.getEnv() }));
vi.mock("@/lib/platforms/finlink/sync", () => ({ syncFinLinkLeads: h.sync }));
vi.mock("@/lib/db", () => ({
  prisma: {
    organization: { findMany: h.organizationFindMany },
    user: { findFirst: h.userFindFirst },
  },
}));

import { GET } from "@/app/api/cron/finlink-leads/route";

function anfrage(header?: string) {
  return new Request("https://baufidesk.de/api/cron/finlink-leads", {
    headers: header ? { authorization: header } : {},
  });
}

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  // Der FinLink-Zugang gehoert genau EINER Organisation (seit 08.09.2026).
  vi.stubEnv("FINLINK_ORGANIZATION_ID", "org-A");
  h.getEnv.mockReturnValue({ CRON_SECRET: "geheim" });
  h.organizationFindMany.mockResolvedValue([{ id: "org-A" }]);
  h.userFindFirst.mockResolvedValue({ id: "user-1" });
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

  it("übergibt den ersten aktiven Nutzer als Betreuer", async () => {
    // brokerId ist ein Fremdschlüssel – ein leerer String würde die Anlage
    // kippen, und ohne Betreuer taucht der Fall in keiner Liste auf.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await GET(anfrage("Bearer geheim") as any);
    expect(h.sync).toHaveBeenCalledWith({ organizationId: "org-A", userId: "user-1" });
  });

  it("läuft auch ohne Nutzer in der Organisation", async () => {
    h.userFindFirst.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(200);
    expect(h.sync).toHaveBeenCalledWith({ organizationId: "org-A", userId: "" });
  });

  it("gleicht NUR die Organisation ab, der der FinLink-Zugang gehoert", async () => {
    // 08.09.2026: Der Cron lief fuer jede Organisation mit demselben Schluessel.
    // Die Leads des Betreibers waeren als Faelle bei fremden Vermittlern gelandet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(200);
    expect(h.organizationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "org-A" } })
    );
    expect(h.sync).toHaveBeenCalledTimes(1);
    expect(h.sync).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-A" }));
  });

  it("laeuft fuer NIEMANDEN, wenn der Zugang keiner Organisation zugeordnet ist", async () => {
    vi.stubEnv("FINLINK_ORGANIZATION_ID", "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(200);
    expect(h.organizationFindMany).not.toHaveBeenCalled();
    expect(h.sync).not.toHaveBeenCalled();
    expect((await res.json()).organisationen).toBe(0);
  });

  it("meldet einen Fehler im Abgleich als Fehler, ohne selbst zu kippen", async () => {
    h.sync.mockRejectedValue(new Error("kaputt"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.angelegt).toBe(0);
    expect(body.fehler).toBe(1);
  });
});
