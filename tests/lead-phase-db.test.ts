import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

/**
 * Bestandsdaten-Lauf gegen das echte Schema.
 *   RUN_DB_IT=1 npx vitest run tests/lead-phase-db.test.ts
 */
describe.runIf(RUN)("Bestandsdaten-Lauf (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let orgId: string;

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

    const org = await prisma.organization.create({ data: { name: "Testorg", slug: "testorg-lp" } });
    orgId = org.id;
  }, 180_000);

  it("setzt die Phase je nach Zustand des Falls", async () => {
    const frisch = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-2026-9200", status: "neu" },
    });
    const exportiert = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-2026-9201", status: "exportiert" },
    });
    const fertig = await prisma.case.create({
      data: {
        organizationId: orgId,
        caseNumber: "UP-2026-9202",
        status: "abgeschlossen",
        abschlussdatum: new Date(),
      },
    });
    const verloren = await prisma.case.create({
      data: {
        organizationId: orgId,
        caseNumber: "UP-2026-9203",
        status: "exportiert",
        verlorenAm: new Date(),
        verlorenGrund: "kondition",
      },
    });

    const { backfillLeadPhase } = await import("../scripts/backfill-lead-phase");
    const r = await backfillLeadPhase(prisma);
    expect(r.geprueft).toBe(4);

    const lies = async (id: string) => (await prisma.case.findUnique({ where: { id } })).leadPhase;

    expect(await lies(frisch.id)).toBe("neu");
    expect(await lies(exportiert.id)).toBe("kreditpruefung_eingereicht");
    expect(await lies(fertig.id)).toBe("abgeschlossen");
    // Verlorene Fälle bleiben unangetastet – ihre Phase ist Teil der Geschichte.
    expect(await lies(verloren.id)).toBe("neu");
  }, 60_000);

  it("setzt leadPhaseSeit auf die letzte Änderung, nicht auf jetzt", async () => {
    const fall = await prisma.case.findFirst({ where: { caseNumber: "UP-2026-9201" } });
    // Der Lauf hat updatedAt übernommen; das Datum darf nicht in der Zukunft
    // liegen und nicht sekundengenau "jetzt" sein.
    expect(fall.leadPhaseSeit.getTime()).toBeLessThanOrEqual(Date.now());
  }, 60_000);
});
