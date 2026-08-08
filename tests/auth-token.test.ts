import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890" }),
}));

// Minimale In-Memory-Ablage statt echter Datenbank: dieses Modul soll ohne
// Postgres pruefbar sein. Der Durchstich gegen das echte Schema folgt in
// tests/signup-db.test.ts.
const zeilen = new Map<string, Record<string, unknown>>();
vi.mock("@/lib/db", () => ({
  prisma: {
    authToken: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Record<string, unknown> = { id: `t${zeilen.size + 1}`, usedAt: null, ...data };
        zeilen.set(row.tokenHash as string, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
        zeilen.get(where.tokenHash) ?? null
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        for (const row of zeilen.values()) {
          if (row.id === where.id && row.usedAt === null) {
            Object.assign(row, data);
            return { count: 1 };
          }
        }
        return { count: 0 };
      }),
    },
  },
}));

beforeEach(() => zeilen.clear());

describe("AuthToken", () => {
  it("speichert nie das Klartext-Token", async () => {
    const { erstelleToken } = await import("@/lib/auth/tokens");
    const { token } = await erstelleToken({
      zweck: "passwort_reset",
      userId: "u1",
      gueltigSekunden: 3600,
    });
    for (const row of zeilen.values()) {
      expect(row.tokenHash).not.toBe(token);
    }
  });

  it("loest ein gueltiges Token genau einmal ein", async () => {
    const { erstelleToken, verbraucheToken } = await import("@/lib/auth/tokens");
    const { token } = await erstelleToken({
      zweck: "passwort_reset",
      userId: "u1",
      gueltigSekunden: 3600,
    });
    await expect(verbraucheToken(token, "passwort_reset")).resolves.toMatchObject({ userId: "u1" });
    await expect(verbraucheToken(token, "passwort_reset")).resolves.toBeNull();
  });

  it("weist ein Einladungstoken als Passwort-Reset ab", async () => {
    const { erstelleToken, verbraucheToken } = await import("@/lib/auth/tokens");
    const { token } = await erstelleToken({
      zweck: "einladung",
      userId: "u1",
      gueltigSekunden: 3600,
    });
    await expect(verbraucheToken(token, "passwort_reset")).resolves.toBeNull();
    // und bleibt fuer den richtigen Zweck weiterhin gueltig
    await expect(verbraucheToken(token, "einladung")).resolves.toMatchObject({ userId: "u1" });
  });

  it("weist abgelaufene Token ab", async () => {
    const { erstelleToken, verbraucheToken } = await import("@/lib/auth/tokens");
    const { token } = await erstelleToken({
      zweck: "email_bestaetigung",
      signupRequestId: "s1",
      gueltigSekunden: -1,
    });
    await expect(verbraucheToken(token, "email_bestaetigung")).resolves.toBeNull();
  });

  it("weist erfundene Token ab", async () => {
    const { verbraucheToken } = await import("@/lib/auth/tokens");
    await expect(verbraucheToken("frei-erfunden", "einladung")).resolves.toBeNull();
  });
});
