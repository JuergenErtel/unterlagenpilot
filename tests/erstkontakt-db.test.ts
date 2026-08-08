import { describe, it, expect, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests",
    APP_BASE_URL: "https://baufidesk.de",
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

/**
 * Erstkontakt-Vorbereitung gegen das echte Schema: Links + Nachrichtenentwurf
 * entstehen als Zeilen, ein zweiter Lauf legt nichts doppelt an. Standardmäßig
 * übersprungen (PGlite ist schwer):
 *   RUN_DB_IT=1 npx vitest run tests/erstkontakt-db.test.ts
 */
describe.runIf(RUN)("Erstkontakt vorbereiten (PGlite)", () => {
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

    const org = await prisma.organization.create({
      data: { name: "Testorg", slug: "testorg-ek" },
    });
    orgId = org.id;
  }, 180_000);

  it("legt Links und einen unversendeten Entwurf an; ein zweiter Lauf legt nichts doppelt an", async () => {
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-2026-9200", status: "neu" },
    });
    await prisma.applicant.create({
      data: { caseId: c.id, position: 1, vorname: "Anna", nachname: "Beispiel", email: "anna@example.de" },
    });

    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    const res = await bereiteErstkontaktVor(c.id);
    expect(res.status).toBe("vorbereitet");

    expect(await prisma.generatedMessage.count({ where: { caseId: c.id } })).toBe(1);
    const nachricht = await prisma.generatedMessage.findFirst({ where: { caseId: c.id } });
    expect(nachricht.sent).toBe(false);

    expect(await prisma.uploadLink.count({ where: { caseId: c.id } })).toBe(1);
    expect(await prisma.selfDisclosureLink.count({ where: { caseId: c.id } })).toBe(1);

    const fall = await prisma.case.findUnique({ where: { id: c.id } });
    expect(fall.erstkontaktVorbereitetAm).not.toBeNull();

    // Zweiter Lauf: schon vorbereitet, nichts zusätzlich angelegt.
    const zweiterLauf = await bereiteErstkontaktVor(c.id);
    expect(zweiterLauf).toEqual({ status: "schon_vorbereitet" });
    expect(await prisma.generatedMessage.count({ where: { caseId: c.id } })).toBe(1);
    expect(await prisma.uploadLink.count({ where: { caseId: c.id } })).toBe(1);
    expect(await prisma.selfDisclosureLink.count({ where: { caseId: c.id } })).toBe(1);
  }, 60_000);

  it("legt ohne E-Mail-Adresse keine Links und keine Nachricht an", async () => {
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-2026-9201", status: "neu" },
    });
    await prisma.applicant.create({
      data: { caseId: c.id, position: 1, vorname: "Ohne", nachname: "Mail" },
    });

    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    const res = await bereiteErstkontaktVor(c.id);
    expect(res).toEqual({ status: "kein_empfaenger" });

    expect(await prisma.generatedMessage.count({ where: { caseId: c.id } })).toBe(0);
    expect(await prisma.uploadLink.count({ where: { caseId: c.id } })).toBe(0);
    expect(await prisma.selfDisclosureLink.count({ where: { caseId: c.id } })).toBe(0);

    const fall = await prisma.case.findUnique({ where: { id: c.id } });
    expect(fall.erstkontaktVorbereitetAm).toBeNull();
  }, 60_000);

  it("laesst bei echter Nebenlaeufigkeit (Cron + Knopf) nur einen Lauf gewinnen", async () => {
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-2026-9203", status: "neu" },
    });
    await prisma.applicant.create({
      data: {
        caseId: c.id,
        position: 1,
        vorname: "Gleichzeitig",
        nachname: "Zwei",
        email: "gleichzeitig@example.de",
      },
    });

    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    // Nicht nacheinander, sondern wirklich gleichzeitig gestartet – genau das
    // Szenario aus Cron (alle 15 Min) und manuellem Abgleichsknopf.
    const [a, b] = await Promise.all([bereiteErstkontaktVor(c.id), bereiteErstkontaktVor(c.id)]);
    expect([a.status, b.status].sort()).toEqual(["schon_vorbereitet", "vorbereitet"]);

    expect(await prisma.generatedMessage.count({ where: { caseId: c.id } })).toBe(1);
    expect(await prisma.uploadLink.count({ where: { caseId: c.id } })).toBe(1);
    expect(await prisma.selfDisclosureLink.count({ where: { caseId: c.id } })).toBe(1);
  }, 60_000);

  it("nimmt die Reservierung zurueck, wenn die Entwurfsanlage scheitert", async () => {
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-2026-9204", status: "neu" },
    });
    await prisma.applicant.create({
      data: { caseId: c.id, position: 1, vorname: "Kaputt", nachname: "Fall", email: "kaputt@example.de" },
    });

    const uploadLinkModul = await import("@/lib/security/upload-link");
    const spy = vi
      .spyOn(uploadLinkModul, "createSecureUploadLink")
      .mockRejectedValueOnce(new Error("kaputt"));
    const { bereiteErstkontaktVor } = await import("@/lib/cases/erstkontakt");
    await expect(bereiteErstkontaktVor(c.id)).rejects.toThrow("kaputt");
    spy.mockRestore();

    const fall = await prisma.case.findUnique({ where: { id: c.id } });
    expect(fall.erstkontaktVorbereitetAm).toBeNull();

    // Ein spaeterer Lauf kann es dank der Ruecknahme erneut versuchen.
    const nochmal = await bereiteErstkontaktVor(c.id);
    expect(nochmal.status).toBe("vorbereitet");
  }, 60_000);
});
