import { describe, it, expect, vi, beforeEach } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound, redirect: vi.fn() }));

let aktuellerNutzer: { id: string; platformAdmin: boolean } | null = null;

vi.mock("@/lib/auth/context", async (orig) => {
  const echt = (await orig()) as Record<string, unknown>;
  return {
    ...echt,
    getCurrentContext: vi.fn(async () =>
      aktuellerNutzer ? { organizationId: "o1", userId: aktuellerNutzer.id, role: "org_admin", isDemo: false } : null
    ),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () =>
        aktuellerNutzer ? { id: aktuellerNutzer.id, platformAdmin: aktuellerNutzer.platformAdmin, active: true } : null
      ),
    },
  },
}));

beforeEach(() => {
  notFound.mockClear();
});

describe("Plattform-Freigabe: Zugriff", () => {
  it("laesst einen platformAdmin durch", async () => {
    aktuellerNutzer = { id: "u1", platformAdmin: true };
    const { requirePlatformAdmin } = await import("@/lib/auth/platform-admin");
    await expect(requirePlatformAdmin()).resolves.toMatchObject({ userId: "u1" });
  });

  it("antwortet fuer einen gewoehnlichen org_admin mit 404, nicht mit 403", async () => {
    aktuellerNutzer = { id: "u2", platformAdmin: false };
    const { requirePlatformAdmin } = await import("@/lib/auth/platform-admin");
    await expect(requirePlatformAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("antwortet ohne Anmeldung ebenfalls mit 404", async () => {
    aktuellerNutzer = null;
    const { requirePlatformAdmin } = await import("@/lib/auth/platform-admin");
    await expect(requirePlatformAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
