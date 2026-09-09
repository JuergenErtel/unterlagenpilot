import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests",
    APP_BASE_URL: "https://baufidesk.de",
  }),
}));

const tokenCreate = vi.fn();
const tokenFindUnique = vi.fn();
const tokenUpdate = vi.fn();
const tokenUpdateMany = vi.fn();
const tokenFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    geraeteToken: {
      create: (...a: unknown[]) => tokenCreate(...a),
      findUnique: (...a: unknown[]) => tokenFindUnique(...a),
      update: (...a: unknown[]) => tokenUpdate(...a),
      updateMany: (...a: unknown[]) => tokenUpdateMany(...a),
      findMany: (...a: unknown[]) => tokenFindMany(...a),
    },
  },
}));

import {
  createGeraeteToken,
  resolveGeraeteToken,
  hashGeraeteToken,
  revokeGeraeteToken,
} from "@/lib/security/geraete-token";
import { hashToken } from "@/lib/security/upload-token";

/** Vollstaendige Zeile, wie sie resolveGeraeteToken erwartet. */
function zeile(ueberschreibungen: Record<string, unknown> = {}) {
  return {
    id: "gt-1",
    bezeichnung: "iPhone",
    active: true,
    user: {
      id: "user-1",
      name: "Juergen",
      active: true,
      role: "vermittler",
      platformAdmin: false,
      backofficeRolle: null,
      organizationId: "org-1",
      organization: { name: "Coding Brothers" },
    },
    ...ueberschreibungen,
  };
}

/** Liefert die Zeile nur, wenn wirklich per Hash des Tokens gesucht wurde. */
function zeileNurBeiHash(token: string, row: unknown) {
  tokenFindUnique.mockImplementation(async (args: unknown) => {
    const where = (args as { where: { tokenHash?: string } }).where;
    return where.tokenHash === hashGeraeteToken(token) ? row : null;
  });
}

beforeEach(() => {
  tokenCreate.mockReset();
  tokenFindUnique.mockReset();
  tokenUpdate.mockReset();
  tokenUpdateMany.mockReset();
  tokenFindMany.mockReset();
  tokenCreate.mockResolvedValue({ id: "gt-1" });
  tokenUpdate.mockResolvedValue({ id: "gt-1" });
  tokenUpdateMany.mockResolvedValue({ count: 1 });
  tokenFindMany.mockResolvedValue([]);
});

describe("Geraetetoken – Erzeugung", () => {
  it("ist als BaufiDesk-Token erkennbar und ausreichend zufaellig", async () => {
    const { token } = await createGeraeteToken({
      userId: "user-1",
      organizationId: "org-1",
      bezeichnung: "iPhone",
    });
    expect(token.startsWith("bd_")).toBe(true);
    // 24 Byte Zufall = 32 Zeichen base64url, plus Praefix.
    expect(token.length).toBeGreaterThanOrEqual(35);
  });

  it("speichert NIE das Klartext-Token, nur seinen Hash", async () => {
    const { token } = await createGeraeteToken({
      userId: "user-1",
      organizationId: "org-1",
      bezeichnung: "iPhone",
    });
    const geschrieben = JSON.stringify(tokenCreate.mock.calls[0]?.[0]);
    expect(geschrieben).not.toContain(token);
    expect(geschrieben).toContain(hashGeraeteToken(token));
  });

  it("haelt einen frisch erzeugten Token vom vorherigen auseinander", async () => {
    const a = await createGeraeteToken({ userId: "u", organizationId: "o", bezeichnung: "A" });
    const b = await createGeraeteToken({ userId: "u", organizationId: "o", bezeichnung: "B" });
    expect(a.token).not.toBe(b.token);
  });
});

describe("Geraetetoken – Abgrenzung zu Kunden-Upload-Links", () => {
  /*
   * Beide Tokenarten liegen gehasht in derselben Datenbank und werden mit
   * demselben Geheimnis gehasht. Waere die Ableitung identisch, koennte ein
   * Kunden-Upload-Token als Geraetetoken durchgehen (und damit die Faelle des
   * Vermittlers oeffnen) – die Bereichstrennung haengt allein an dieser Marke.
   */
  it("hasht denselben Wert anders als ein Upload-Link-Token", () => {
    const wert = "identischer-wert";
    expect(hashGeraeteToken(wert)).not.toBe(hashToken(wert));
  });
});

describe("Geraetetoken – Aufloesung", () => {
  it("liefert den Kontext des Besitzers", async () => {
    const { token } = await createGeraeteToken({
      userId: "user-1",
      organizationId: "org-1",
      bezeichnung: "iPhone",
    });
    zeileNurBeiHash(token, zeile());

    const auf = await resolveGeraeteToken(token);
    expect(auf?.tokenId).toBe("gt-1");
    expect(auf?.ctx.userId).toBe("user-1");
    expect(auf?.ctx.organizationId).toBe("org-1");
    expect(auf?.ctx.isDemo).toBe(false);
  });

  it("weist ein unbekanntes Token ab", async () => {
    tokenFindUnique.mockResolvedValue(null);
    expect(await resolveGeraeteToken("bd_voellig-erfunden")).toBeNull();
  });

  it("weist ein widerrufenes Token ab", async () => {
    const { token } = await createGeraeteToken({ userId: "u", organizationId: "o", bezeichnung: "X" });
    zeileNurBeiHash(token, zeile({ active: false }));
    expect(await resolveGeraeteToken(token)).toBeNull();
  });

  it("weist das Token eines gesperrten Nutzers ab", async () => {
    const { token } = await createGeraeteToken({ userId: "u", organizationId: "o", bezeichnung: "X" });
    zeileNurBeiHash(token, zeile({ user: { ...zeile().user, active: false } }));
    expect(await resolveGeraeteToken(token)).toBeNull();
  });

  it("weist leere und formlose Eingaben ab, ohne die Datenbank zu fragen", async () => {
    expect(await resolveGeraeteToken("")).toBeNull();
    expect(await resolveGeraeteToken("   ")).toBeNull();
    expect(tokenFindUnique).not.toHaveBeenCalled();
  });

  it("vermerkt die Nutzung am Token", async () => {
    const { token } = await createGeraeteToken({ userId: "u", organizationId: "o", bezeichnung: "X" });
    zeileNurBeiHash(token, zeile());
    await resolveGeraeteToken(token);
    expect(tokenUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "gt-1" } })
    );
  });
});

describe("Geraetetoken – Widerruf", () => {
  it("widerruft nur Token des eigenen Nutzers", async () => {
    await revokeGeraeteToken("gt-1", { userId: "user-1", organizationId: "org-1" });
    const args = tokenUpdateMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ id: "gt-1", userId: "user-1" });
  });
});
