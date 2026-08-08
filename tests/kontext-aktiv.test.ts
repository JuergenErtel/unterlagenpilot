import { describe, it, expect, vi, beforeEach } from "vitest";

const nutzer = {
  gefunden: true,
  active: true,
  organizationId: "o1",
  name: "Anna",
  role: "org_admin" as const,
};

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    AUTH_SECRET: "test-auth-secret-1234567890",
    AUTH_MODE: "session",
    SESSION_COOKIE_NAME: "up_session",
    SESSION_TTL_HOURS: 12,
  }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    organization: { findUnique: vi.fn(async () => ({ name: "Beispiel Finanz" })) },
    user: {
      findUnique: vi.fn(async () =>
        nutzer.gefunden
          ? { id: "u1", active: nutzer.active, organizationId: nutzer.organizationId, name: nutzer.name, role: nutzer.role }
          : null
      ),
      findFirst: vi.fn(async () => null),
    },
  },
}));

let cookieWert: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieWert ? { value: cookieWert } : undefined) }),
}));

beforeEach(() => {
  nutzer.gefunden = true;
  nutzer.active = true;
});

async function sessionCookieFuer(): Promise<string> {
  const { createSessionToken } = await import("@/lib/auth/session");
  return createSessionToken({ sub: "u1", org: "o1", role: "org_admin", name: "Anna" });
}

describe("Kontext aus der Session", () => {
  it("laesst einen aktiven Nutzer durch", async () => {
    cookieWert = await sessionCookieFuer();
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toMatchObject({ userId: "u1", organizationId: "o1" });
  });

  it("sperrt einen deaktivierten Nutzer trotz gueltigem Cookie aus", async () => {
    cookieWert = await sessionCookieFuer();
    nutzer.active = false;
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toBeNull();
  });

  it("sperrt aus, wenn der Nutzer geloescht wurde", async () => {
    cookieWert = await sessionCookieFuer();
    nutzer.gefunden = false;
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toBeNull();
  });

  it("nimmt Rolle und Organisation aus der DB, nicht aus dem Cookie", async () => {
    // Cookie behauptet o1/org_admin – die DB sagt o2/teammitglied. Die DB gewinnt,
    // sonst behielte ein herabgestufter Nutzer seine Rechte bis zum Ablauf.
    cookieWert = await sessionCookieFuer();
    nutzer.organizationId = "o2";
    nutzer.role = "teammitglied" as never;
    const { getCurrentContext } = await import("@/lib/auth/context");
    await expect(getCurrentContext()).resolves.toMatchObject({
      organizationId: "o2",
      role: "teammitglied",
    });
    nutzer.organizationId = "o1";
    nutzer.role = "org_admin";
  });
});
