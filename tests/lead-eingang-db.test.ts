import { describe, it, expect, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

/**
 * Zwei Läufe hintereinander gegen das echte Schema: Der zweite darf nichts
 * doppelt anlegen.
 *   RUN_DB_IT=1 npx vitest run tests/lead-eingang-db.test.ts
 */
describe.runIf(RUN)("Lead-Eingang (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let orgId: string;

  const lead = {
    id: "L-1",
    createdAt: "2026-08-07T12:00:00Z",
    sourceType: "ImmoscoutLead",
    source: null,
    einwilligungKontakt: true,
    einwilligungMarketing: null,
  };

  const client = {
    fetchLeadsPage: async () => [lead],
    fetchVorgang: async () => ({
      id: "L-1",
      antragsteller: [{ vorname: "Test", nachname: "Person" }],
    }),
    listLeads: async () => [],
  };

  beforeAll(async () => {
    process.env.UP_SEED_NO_AUTORUN = "1";
    const ddl = execFileSync(
      "npx",
      [
        "prisma",
        "migrate",
        "diff",
        "--from-empty",
        "--to-schema-datamodel",
        "prisma/schema.prisma",
        "--script",
      ],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const { PGlite } = await import("@electric-sql/pglite");
    const { PrismaPGlite } = await import("pglite-prisma-adapter");
    const { PrismaClient } = await import("@prisma/client");
    const pg = new PGlite();
    await pg.exec(ddl);
    const adapter = new PrismaPGlite(pg) as never;
    prisma = new PrismaClient({ adapter });
    g.prisma = prisma;

    const org = await prisma.organization.create({ data: { name: "Testorg", slug: "testorg-le" } });
    orgId = org.id;
    // Marke vor dem Lead setzen, damit er als neu gilt.
    await prisma.leadSyncState.create({
      data: {
        organizationId: orgId,
        quelle: "finlink",
        syncedUntil: new Date("2026-08-07T00:00:00Z"),
      },
    });
  }, 180_000);

  it("legt einen Fall auch ohne Betreuer an – der Cron gehört keinem Menschen", async () => {
    const { syncFinLinkLeads } = await import("@/lib/platforms/finlink/sync");
    // Leerer userId wie im Cron-Lauf: brokerId ist ein Fremdschlüssel, ein
    // leerer String würde die Anlage kippen.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await syncFinLinkLeads({ organizationId: orgId, userId: "" }, { client: client as any });
    expect(r.status).toBe("ok");
    expect(r.angelegt).toBe(1);

    const fall = await prisma.case.findFirst({ where: { organizationId: orgId } });
    expect(fall.quelle).toBe("immoscout24");
    expect(fall.quelleDetail).toBe("ImmoscoutLead");
    expect(fall.einwilligungKontakt).toBe(true);
    expect(fall.leadPhase).toBe("neu");

    const state = await prisma.leadSyncState.findFirst({ where: { organizationId: orgId } });
    expect(state.syncedUntil.toISOString()).toBe("2026-08-07T12:00:00.000Z");
  }, 60_000);

  it("legt beim zweiten Lauf nichts doppelt an", async () => {
    const { syncFinLinkLeads } = await import("@/lib/platforms/finlink/sync");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await syncFinLinkLeads({ organizationId: orgId, userId: "" }, { client: client as any });
    expect(r.angelegt).toBe(0);
    expect(await prisma.case.count({ where: { organizationId: orgId } })).toBe(1);
  }, 60_000);
});
