import { describe, it, expect, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests-1234567890",
    APP_BASE_URL: "https://baufidesk.de",
    AUTH_SECRET: "test-auth-secret-1234567890",
    SESSION_TTL_HOURS: 12,
    SESSION_COOKIE_NAME: "up_session",
    AUTH_MODE: "session",
  }),
}));

/**
 * Der ganze Weg gegen das echte Schema: Antrag → Bestaetigung → Freigabe →
 * Anmeldung. Standardmaessig uebersprungen (PGlite ist schwer):
 *   RUN_DB_IT=1 npx vitest run tests/signup-db.test.ts
 */
describe.runIf(RUN)("Registrierung (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let adminUserId: string;

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

    // Tarife anlegen (die Freigabe braucht eine Plan-Zeile).
    for (const tier of ["starter", "pro", "team"] as const) {
      await prisma.plan.create({ data: { tier, name: tier, features: [] } });
    }
    // Betreiberkonto in einer eigenen Organisation.
    const betreiberOrg = await prisma.organization.create({
      data: { name: "Coding Brothers", slug: "coding-brothers" },
    });
    const admin = await prisma.user.create({
      data: {
        organizationId: betreiberOrg.id,
        email: "betreiber@baufidesk.de",
        name: "Betreiber",
        role: "org_admin",
        platformAdmin: true,
      },
    });
    adminUserId = admin.id;
  }, 180_000);

  it("legt bei der Freigabe Organisation, Nutzer und Abo in einem Rutsch an", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei } = await import("@/lib/auth/freigabe");

    const angelegt = await erstelleAntrag(
      {
        name: "Anna Beispiel",
        firmenname: "Beispiel Finanz GmbH",
        email: "anna@beispiel.de",
        passwort: "einLangesGeheimwort2026",
        wunschtarif: "pro",
        agb: true,
      },
      { ip: "1.2.3.4" }
    );
    expect(angelegt.status).toBe("neu_angelegt");
    if (angelegt.status !== "neu_angelegt") throw new Error("unerwartet");

    // Vor der Bestaetigung existiert KEINE Organisation.
    expect(await prisma.organization.count()).toBe(1); // nur die Betreiber-Org

    await expect(bestaetigeEmail(angelegt.token)).resolves.toMatchObject({ ok: true });

    const res = await gibFrei(angelegt.requestId, {
      tier: "pro",
      testEndeAm: new Date("2026-09-30"),
      adminUserId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unerwartet");

    const org = await prisma.organization.findUnique({ where: { id: res.organizationId } });
    expect(org.slug).toBe("beispiel-finanz-gmbh");
    const nutzer = await prisma.user.findUnique({ where: { id: res.userId } });
    expect(nutzer.role).toBe("org_admin");
    expect(nutzer.platformAdmin).toBe(false);
    const abo = await prisma.subscription.findUnique({ where: { organizationId: res.organizationId } });
    expect(abo.status).toBe("trialing");
    const antrag = await prisma.signupRequest.findUnique({ where: { id: angelegt.requestId } });
    expect(antrag.status).toBe("freigegeben");
    expect(antrag.organizationId).toBe(res.organizationId);
  }, 60_000);

  it("uebernimmt das bei der Anmeldung gesetzte Passwort", async () => {
    const { getAuthProvider } = await import("@/lib/auth/provider");
    await expect(
      getAuthProvider().authenticate("anna@beispiel.de", "einLangesGeheimwort2026")
    ).resolves.toMatchObject({ role: "org_admin" });
    await expect(
      getAuthProvider().authenticate("anna@beispiel.de", "falsch")
    ).resolves.toBeNull();
  }, 60_000);

  it("haengt bei gleichem Firmennamen einen Zaehler an den Slug", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei } = await import("@/lib/auth/freigabe");
    const zweiter = await erstelleAntrag(
      {
        name: "Bernd Beispiel",
        firmenname: "Beispiel Finanz GmbH",
        email: "bernd@beispiel.de",
        passwort: "einAnderesLangesGeheimwort",
        agb: true,
      },
      { ip: null }
    );
    if (zweiter.status !== "neu_angelegt") throw new Error("unerwartet");
    await bestaetigeEmail(zweiter.token);
    const res = await gibFrei(zweiter.requestId, { tier: "starter", testEndeAm: null, adminUserId });
    if (!res.ok) throw new Error("unerwartet");
    const org = await prisma.organization.findUnique({ where: { id: res.organizationId } });
    expect(org.slug).toBe("beispiel-finanz-gmbh-2");
  }, 60_000);

  it("hinterlaesst keine halbe Organisation, wenn die Adresse inzwischen vergeben ist", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei } = await import("@/lib/auth/freigabe");
    const dritter = await erstelleAntrag(
      {
        name: "Clara Beispiel",
        firmenname: "Clara Finanz",
        email: "clara@beispiel.de",
        passwort: "nochEinLangesGeheimwort",
        agb: true,
      },
      { ip: null }
    );
    if (dritter.status !== "neu_angelegt") throw new Error("unerwartet");
    await bestaetigeEmail(dritter.token);

    // Jemand legt die Adresse zwischenzeitlich als Nutzer an.
    const fremd = await prisma.organization.create({ data: { name: "Fremd", slug: "fremd" } });
    await prisma.user.create({
      data: { organizationId: fremd.id, email: "clara@beispiel.de", name: "Clara", role: "vermittler" },
    });

    const vorher = await prisma.organization.count();
    const res = await gibFrei(dritter.requestId, { tier: "pro", testEndeAm: null, adminUserId });
    expect(res).toMatchObject({ ok: false, grund: "adresse_vergeben" });
    expect(await prisma.organization.count()).toBe(vorher);
    const antrag = await prisma.signupRequest.findUnique({ where: { id: dritter.requestId } });
    expect(antrag.status).toBe("bestaetigt"); // bleibt offen, nichts verloren
  }, 60_000);

  it("trennt die Faelle der neuen Organisation von fremden", async () => {
    const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: "beispiel-finanz" } } });
    const [a, b] = orgs;
    await prisma.case.create({ data: { organizationId: a.id, caseNumber: "UP-2026-8001", status: "neu" } });
    await prisma.case.create({ data: { organizationId: b.id, caseNumber: "UP-2026-8002", status: "neu" } });
    const nurA = await prisma.case.findMany({ where: { organizationId: a.id } });
    expect(nurA).toHaveLength(1);
    expect(nurA[0].caseNumber).toBe("UP-2026-8001");
  }, 60_000);

  it("gibt einen abgelehnten Antrag nicht frei", async () => {
    const { erstelleAntrag, bestaetigeEmail } = await import("@/lib/auth/signup");
    const { gibFrei, lehneAb } = await import("@/lib/auth/freigabe");
    const vierter = await erstelleAntrag(
      {
        name: "Dora Beispiel",
        firmenname: "Dora Finanz",
        email: "dora@beispiel.de",
        passwort: "wiederEinLangesGeheimwort",
        agb: true,
      },
      { ip: null }
    );
    if (vierter.status !== "neu_angelegt") throw new Error("unerwartet");
    await bestaetigeEmail(vierter.token);
    await expect(lehneAb(vierter.requestId, "Kein Vermittler", adminUserId)).resolves.toBe(true);
    await expect(
      gibFrei(vierter.requestId, { tier: "pro", testEndeAm: null, adminUserId })
    ).resolves.toMatchObject({ ok: false, grund: "falscher_status" });
  }, 60_000);
});
