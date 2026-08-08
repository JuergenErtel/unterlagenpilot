import { describe, it, expect, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890",
    APP_BASE_URL: "https://baufidesk.de",
  }),
}));

/**
 * Einladung gegen das echte Schema:
 *   RUN_DB_IT=1 npx vitest run tests/invite-db.test.ts
 */
describe.runIf(RUN)("Einladung (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let orgId: string;
  let chefId: string;

  beforeAll(async () => {
    process.env.UP_SEED_NO_AUTORUN = "1";
    const ddl = execFileSync(
      "npx",
      ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const { PGlite } = await import("@electric-sql/pglite");
    const { PrismaPGlite } = await import("pglite-prisma-adapter");
    const { PrismaClient } = await import("@prisma/client");
    const pg = new PGlite();
    await pg.exec(ddl);
    prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) as never });
    g.prisma = prisma;

    // Starter erlaubt genau 1 Nutzer, Pro erlaubt 3 – gute Limit-Probe.
    const starter = await prisma.plan.create({ data: { tier: "starter", name: "Starter", features: [] } });
    await prisma.plan.create({ data: { tier: "pro", name: "Pro", features: [] } });
    const org = await prisma.organization.create({
      data: {
        name: "Beispiel Finanz",
        slug: "beispiel-finanz",
        subscription: { create: { planId: starter.id, status: "trialing" } },
      },
    });
    orgId = org.id;
    const chef = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: "chef@beispiel.de",
        name: "Chefin",
        role: "org_admin",
        passwordHash: "scrypt$16384$abc$def",
      },
    });
    chefId = chef.id;
  }, 180_000);

  it("blockt die Einladung, wenn der Tarif nur einen Nutzer erlaubt", async () => {
    const { ladeEin } = await import("@/lib/auth/invite");
    await expect(
      ladeEin({
        organizationId: orgId,
        email: "neu@beispiel.de",
        name: "Neu",
        rolle: "teammitglied",
        einladenderUserId: chefId,
      })
    ).resolves.toMatchObject({ ok: false, grund: "limit_erreicht" });
    expect(await prisma.user.count({ where: { organizationId: orgId } })).toBe(1);
  }, 60_000);

  it("legt nach Tarifwechsel ein passwortloses Konto samt Token an", async () => {
    const pro = await prisma.plan.findUnique({ where: { tier: "pro" } });
    await prisma.subscription.update({ where: { organizationId: orgId }, data: { planId: pro.id } });

    const { ladeEin } = await import("@/lib/auth/invite");
    const res = await ladeEin({
      organizationId: orgId,
      email: "neu@beispiel.de",
      name: "Neu",
      rolle: "vermittler",
      einladenderUserId: chefId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unerwartet");

    const eingeladen = await prisma.user.findUnique({ where: { id: res.userId } });
    expect(eingeladen.passwordHash).toBeNull();
    expect(eingeladen.invitedAt).toBeInstanceOf(Date);
    g.__inviteToken = res.token;
  }, 60_000);

  it("laesst ein passwortloses Konto sich NICHT anmelden", async () => {
    const { getAuthProvider } = await import("@/lib/auth/provider");
    await expect(getAuthProvider().authenticate("neu@beispiel.de", "")).resolves.toBeNull();
    await expect(getAuthProvider().authenticate("neu@beispiel.de", "irgendwas")).resolves.toBeNull();
  }, 60_000);

  it("setzt beim Einloesen das Passwort und macht das Konto nutzbar", async () => {
    const { loeseEinladungEin } = await import("@/lib/auth/invite");
    const { getAuthProvider } = await import("@/lib/auth/provider");
    const res = await loeseEinladungEin(g.__inviteToken, "einLangesTeamGeheimwort");
    expect(res).toMatchObject({ ok: true, organizationId: orgId, role: "vermittler" });
    await expect(
      getAuthProvider().authenticate("neu@beispiel.de", "einLangesTeamGeheimwort")
    ).resolves.toMatchObject({ organizationId: orgId });
  }, 60_000);

  it("laesst denselben Einladungslink kein zweites Mal zu", async () => {
    const { loeseEinladungEin } = await import("@/lib/auth/invite");
    await expect(loeseEinladungEin(g.__inviteToken, "nochEinLangesGeheimwort")).resolves.toMatchObject({
      ok: false,
      grund: "ungueltig",
    });
  }, 60_000);

  it("weist eine bereits vergebene Adresse ab", async () => {
    const { ladeEin } = await import("@/lib/auth/invite");
    await expect(
      ladeEin({
        organizationId: orgId,
        email: "chef@beispiel.de",
        name: "Doppelt",
        rolle: "teammitglied",
        einladenderUserId: chefId,
      })
    ).resolves.toMatchObject({ ok: false, grund: "adresse_vergeben" });
  }, 60_000);
});
