import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

describe.runIf(RUN)("createCaseFromCanonical (PGlite)", () => {
  let prisma: any;
  let orgId: string;
  let userId: string;

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
    const adapter = new PrismaPGlite(pg as any);
    prisma = new PrismaClient({ adapter } as any);
    g.prisma = prisma; // Injektion für @/lib/db-Singleton (vor erstem Import von @/lib/db)

    const org = await prisma.organization.create({ data: { name: "Testorg", slug: "testorg" } });
    orgId = org.id;
    const user = await prisma.user.create({
      data: { organizationId: orgId, name: "Tester", email: "t@example.com", role: "vermittler", active: true },
    });
    userId = user.id;
  });

  it("legt einen Fall mit Antragstellern, Objekt und Finanzierung an", async () => {
    const { createCaseFromCanonical } = await import("@/lib/platforms/case-writer");
    const res = await createCaseFromCanonical(
      { organizationId: orgId, userId },
      {
        caseNumber: "",
        financingType: "kauf",
        applicants: [{ position: 1, vorname: "Anna", nachname: "Muster", familienstand: "verheiratet" }],
        employment: [{ applicantPosition: 1, beschaeftigungsart: "angestellter", arbeitgeber: "ACME" }],
        income: [{ applicantPosition: 1, nettoMonatlich: 3200 }],
        liabilities: [],
        assets: [],
        property: { objektart: "eigentumswohnung", ort: "Karlsruhe" },
        financing: { finanzierungsart: "kauf", kaufpreis: 450000, darlehenswunsch: 380000 },
        platformIds: { finlinkId: "FL-1" },
      }
    );
    expect(res.deduped).toBe(false);
    expect(res.caseNumber).toMatch(/^UP-\d{4}-\d{4}$/);

    const row = await prisma.case.findUnique({
      where: { id: res.caseId },
      include: { applicants: { include: { employment: true, income: true } }, property: true, financingRequest: true },
    });
    expect(row.finlinkId).toBe("FL-1");
    expect(row.organizationId).toBe(orgId);
    expect(row.applicants).toHaveLength(1);
    expect(row.applicants[0].employment[0].arbeitgeber).toBe("ACME");
    expect(row.applicants[0].income[0].nettoMonatlich).toBe(3200);
    expect(row.property.objektart).toBe("eigentumswohnung");
    expect(row.financingRequest.kaufpreis).toBe(450000);
  });

  it("dedupliziert bei gleicher finlinkId in derselben Organisation", async () => {
    const { createCaseFromCanonical } = await import("@/lib/platforms/case-writer");
    const base = {
      caseNumber: "", applicants: [{ position: 1, vorname: "Dup" }],
      employment: [], income: [], liabilities: [], assets: [],
      financing: {}, platformIds: { finlinkId: "FL-DUP" },
    } as const;
    const first = await createCaseFromCanonical({ organizationId: orgId, userId }, base as any);
    const second = await createCaseFromCanonical({ organizationId: orgId, userId }, base as any);
    expect(second.deduped).toBe(true);
    expect(second.caseId).toBe(first.caseId);
    const count = await prisma.case.count({ where: { organizationId: orgId, finlinkId: "FL-DUP" } });
    expect(count).toBe(1);
  });
});
