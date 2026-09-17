import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Cron-Route des Mail-Eingangs. Sie leert alle fuenf Minuten das
 * Sammelpostfach - und darf das nur mit dem Cron-Geheimnis tun.
 */

const h = vi.hoisted(() => ({ getEnv: vi.fn(), hole: vi.fn() }));

vi.mock("@/lib/env", () => ({ getEnv: () => h.getEnv() }));
vi.mock("@/lib/eingang/mail-abruf", () => ({ holeMailEingang: h.hole }));

import { GET } from "@/app/api/cron/mail-eingang/route";

function anfrage(header?: string) {
  return new Request("https://baufidesk.de/api/cron/mail-eingang", {
    headers: header ? { authorization: header } : {},
  });
}

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  h.getEnv.mockReturnValue({ CRON_SECRET: "geheim" });
  h.hole.mockResolvedValue({ status: "ok", gesehen: 2, angenommen: 3, abgewiesen: 0 });
});

describe("Cron /api/cron/mail-eingang", () => {
  it("weist eine Anfrage ohne Geheimnis mit 401 ab", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage() as any);
    expect(res.status).toBe(401);
    expect(h.hole).not.toHaveBeenCalled();
  });

  it("weist ein falsches Geheimnis ab, ohne das Postfach anzufassen", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer falsch") as any);
    expect(res.status).toBe(401);
    expect(h.hole).not.toHaveBeenCalled();
  });

  it("laeuft ohne gesetztes CRON_SECRET gar nicht erst", async () => {
    h.getEnv.mockReturnValue({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(503);
    expect(h.hole).not.toHaveBeenCalled();
  });

  it("holt mit gueltigem Geheimnis und meldet die Zahlen", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, angenommen: 3 });
  });

  it("meldet ein fehlendes Postfach als Ruhe, nicht als Fehler", async () => {
    // Bis das Postfach steht, laeuft der Cron ins Leere. Ein Fehler hier
    // wuerde das Fehlerbuch alle fuenf Minuten fluten.
    h.hole.mockResolvedValue({ status: "nicht_eingerichtet", gesehen: 0, angenommen: 0, abgewiesen: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(anfrage("Bearer geheim") as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: "nicht_eingerichtet" });
  });
});
