import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890" }),
}));

const nutzer: Array<{ id: string; email: string; active: boolean; passwordHash: string | null }> = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) =>
        nutzer.find((u) => u.email === where.email || u.id === where.id) ?? null
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = nutzer.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return u;
      }),
    },
  },
}));

const verbraucheToken = vi.fn();
vi.mock("@/lib/auth/tokens", () => ({
  TOKEN_GUELTIGKEIT: { email_bestaetigung: 172800, passwort_reset: 3600, einladung: 604800 },
  erstelleToken: vi.fn(async () => ({ id: "t1", token: "reset-token", expiresAt: new Date() })),
  verbraucheToken,
  entwerteOffeneToken: vi.fn(async () => {}),
}));

beforeEach(() => {
  nutzer.length = 0;
  nutzer.push({ id: "u1", email: "anna@beispiel.de", active: true, passwordHash: "scrypt$alt" });
  verbraucheToken.mockReset();
});

describe("Passwort zuruecksetzen", () => {
  it("liefert ein Token fuer eine bekannte Adresse", async () => {
    const { fordereResetAn } = await import("@/lib/auth/passwort");
    await expect(fordereResetAn("anna@beispiel.de")).resolves.toMatchObject({ token: "reset-token" });
  });

  it("liefert null fuer unbekannte Adressen – ohne zu werfen", async () => {
    const { fordereResetAn } = await import("@/lib/auth/passwort");
    await expect(fordereResetAn("niemand@beispiel.de")).resolves.toBeNull();
  });

  it("liefert null fuer deaktivierte Konten", async () => {
    nutzer[0]!.active = false;
    const { fordereResetAn } = await import("@/lib/auth/passwort");
    await expect(fordereResetAn("anna@beispiel.de")).resolves.toBeNull();
  });

  it("setzt ein neues Passwort und ersetzt den alten Hash", async () => {
    verbraucheToken.mockResolvedValue({ id: "t1", userId: "u1", signupRequestId: null });
    const { setzeNeuesPasswort } = await import("@/lib/auth/passwort");
    const res = await setzeNeuesPasswort("reset-token", "einGanzNeuesGeheimwort");
    expect(res).toMatchObject({ ok: true, userId: "u1" });
    expect(nutzer[0]!.passwordHash).not.toBe("scrypt$alt");
    expect(nutzer[0]!.passwordHash?.startsWith("scrypt$")).toBe(true);
  });

  it("weist schwache Passwoerter ab und ruehrt den Hash nicht an", async () => {
    verbraucheToken.mockResolvedValue({ id: "t1", userId: "u1", signupRequestId: null });
    const { setzeNeuesPasswort } = await import("@/lib/auth/passwort");
    const res = await setzeNeuesPasswort("reset-token", "kurz");
    expect(res).toMatchObject({ ok: false, grund: "passwort_schwach" });
    expect(nutzer[0]!.passwordHash).toBe("scrypt$alt");
  });

  it("weist ein ungueltiges Token ab", async () => {
    verbraucheToken.mockResolvedValue(null);
    const { setzeNeuesPasswort } = await import("@/lib/auth/passwort");
    await expect(setzeNeuesPasswort("falsch", "einGanzNeuesGeheimwort")).resolves.toMatchObject({
      ok: false,
      grund: "ungueltig",
    });
  });
});
