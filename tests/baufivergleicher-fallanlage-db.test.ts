import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import type { Uebergabe } from "@/lib/leads/baufivergleicher/vertrag";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

const uebergabe = (externeId: string): Uebergabe => ({
  quelle: "baufivergleicher",
  externeId,
  art: "offer_review",
  eingegangenAm: "2026-09-20T14:03:11.000Z",
  kontakt: { vorname: "Anna", nachname: "Beispiel", email: "a@b.de", telefon: "0170 1234567" },
  finanzierung: {
    finanzierungsart: "purchase",
    betragSpanne: "300k_500k",
    eigenkapitalSpanne: "50k_100k",
    angebotVorhanden: true,
    angebotZins: 3.79,
    angebotAnbieter: "sparkasse",
    plz: null,
    kaufpreis: null,
    eigenkapital: null,
    darlehenswunsch: null,
    haushaltsnetto: null,
  },
  einwilligung: { fassung: "angebot-2026-09-v2", erteiltAm: "2026-09-20T14:03:09.000Z", werbung: false },
  herkunft: {
    quelleText: "landingpage-ads",
    kampagne: null,
    gclid: "abc",
    gbraid: null,
    wbraid: null,
    einstiegspfad: "/baufinanzierungsangebot-vergleichen",
  },
});

describe.runIf(RUN)("legeFallAn (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let orgId: string;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new PrismaPGlite(pg as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma = new PrismaClient({ adapter } as any);
    g.prisma = prisma;

    const org = await prisma.organization.create({ data: { name: "Testorg", slug: "testorg-bv" } });
    orgId = org.id;
    await prisma.user.create({
      data: { organizationId: orgId, name: "Tester", email: "bv@example.com", role: "vermittler", active: true },
    });
  });

  it("macht aus einer Uebergabe einen Fall mit Antragsteller und Herkunft", async () => {
    const { legeFallAn } = await import("@/lib/leads/baufivergleicher/fallanlage");
    const r = await legeFallAn(uebergabe("offer_a"), orgId);

    expect(r.dublette).toBe(false);
    expect(r.caseNumber).toMatch(/^UP-\d{4}-\d{4}$/);

    const fall = await prisma.case.findUnique({
      where: { id: r.caseId },
      include: { applicants: true, sources: true, financingRequest: true },
    });
    expect(fall.quelle).toBe("baufivergleicher");
    expect(fall.quelleDetail).toBe("landingpage-ads");
    expect(fall.externeQuelle).toBe("baufivergleicher");
    expect(fall.externeId).toBe("offer_a");
    expect(fall.brokerId).not.toBeNull();
    expect(fall.applicants).toHaveLength(1);
    // Feldnamen am Antragsteller sind `phone`/`email`, nicht telefon/mail.
    expect(fall.applicants[0].phone).toBe("0170 1234567");
    expect(fall.applicants[0].email).toBe("a@b.de");
    expect(fall.applicants[0].vorname).toBe("Anna");
    // Quellenart ist "kundenformular" - der Interessent hat selbst ausgefuellt.
    expect(fall.sources[0].type).toBe("kundenformular");
    expect(fall.sources[0].externalId).toBe("offer_a");
  });

  it("traegt die Spanne als Vermerk ein und laesst den Kaufpreis LEER", async () => {
    const { legeFallAn } = await import("@/lib/leads/baufivergleicher/fallanlage");
    const r = await legeFallAn(uebergabe("offer_b"), orgId);
    const fall = await prisma.case.findUnique({
      where: { id: r.caseId },
      include: { financingRequest: true },
    });
    expect(fall.notes).toContain("300.000");
    expect(fall.financingRequest.kaufpreis).toBeNull();
  });

  it("legt bei derselben externen ID KEINEN zweiten Fall an", async () => {
    const { legeFallAn } = await import("@/lib/leads/baufivergleicher/fallanlage");
    const erst = await legeFallAn(uebergabe("offer_c"), orgId);
    const zweit = await legeFallAn(uebergabe("offer_c"), orgId);

    expect(zweit.dublette).toBe(true);
    expect(zweit.caseId).toBe(erst.caseId);
    expect(await prisma.case.count({ where: { organizationId: orgId, externeId: "offer_c" } })).toBe(1);
  });

  it("verschickt nichts - es entsteht kein message.sent im Protokoll", async () => {
    const { legeFallAn } = await import("@/lib/leads/baufivergleicher/fallanlage");
    await legeFallAn(uebergabe("offer_d"), orgId);
    expect(await prisma.auditLog.count({ where: { action: "message.sent" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "case.created" } })).toBeGreaterThan(0);
  });
});
