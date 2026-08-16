import { describe, it, expect, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

// Der Vermittler-Kontext hängt an Cookies/Session – für den Datenbanklauf
// gemockt. Alles andere (Fallgeburt, Uebernahmekern, Fallnummernvergabe)
// läuft echt gegen das per PGlite aus dem Schema erzeugte DDL.
vi.mock("@/lib/auth/context", () => ({
  requireCaseAccess: vi.fn(async (caseId: string) => ({
    ctx: { organizationId: g.__orgId, userId: null },
    caseRow: { id: caseId, organizationId: g.__orgId },
  })),
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    UPLOAD_TOKEN_SECRET: "test-secret-fuer-tests",
    APP_BASE_URL: "https://baufidesk.de",
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * Die Fallgeburt gegen das echte Schema: Formular + Bogen anlegen, absenden,
 * prüfen, dass der Fall gefüllt entsteht. Standardmäßig übersprungen (PGlite
 * ist schwer):
 *   RUN_DB_IT=1 npx vitest run tests/anfrage-fallgeburt-db.test.ts
 *
 * Die Antworten decken bewusst den PROPERTY- und den CASE-Zweig des
 * gemeinsamen Schreibkerns ab (Objektort/Kaufpreis bzw. Finanzierungsart) –
 * neben "applicant" sind das die Zweige, die weder die Attrappen-Tests noch
 * selbstauskunft-db.test.ts berühren.
 */
describe.runIf(RUN)("Anfrageformular-Fallgeburt (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let orgId: string;
  let formular: { id: string; organizationId: string; brokerId: string };

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
      data: { name: "Testorg", slug: "testorg-fg" },
    });
    orgId = org.id;
    g.__orgId = orgId;

    const broker = await prisma.user.create({
      data: { organizationId: orgId, email: "berater@testorg-fg.de", name: "Berater" },
    });
    const lf = await prisma.leadformular.create({
      data: { organizationId: orgId, brokerId: broker.id, slug: "testorg-fg" },
    });
    formular = { id: lf.id, organizationId: orgId, brokerId: broker.id };
  }, 180_000);

  function antwortenEinerPerson() {
    return {
      // Case-Zweig: die erste Frage des Bogens landet auf Case.financingType.
      "vorhaben.art": "kauf_bestand",
      "p1.personen.nachname": "Mustermann",
      "p1.personen.email": "max@example.de",
      "p1.personen.telefon": "0170 1234567",
      // Property-Zweig: Objektort und Kaufpreis landen auf Property/FinancingRequest.
      "objekt_preis.plz": "80331",
      "objekt_preis.ort": "München",
      "objekt_preis.kaufpreis": "400000",
    };
  }

  it("erzeugt genau einen Fall mit den Antworten darin", async () => {
    const { gebaereFall } = await import("@/lib/leadformular/fallgeburt");

    const link = await prisma.selfDisclosureLink.create({
      data: { formularId: formular.id, tokenHash: "hash-1", expiresAt: new Date(Date.now() + 86400_000) },
    });
    const bogen = await prisma.selfDisclosure.create({
      data: { linkId: link.id, answers: antwortenEinerPerson() },
    });

    const fallId = await gebaereFall(bogen.id, antwortenEinerPerson(), formular, new Date());

    const fall = await prisma.case.findUnique({
      where: { id: fallId },
      include: { applicants: { orderBy: { position: "asc" } }, financingRequest: true, property: true },
    });
    expect(fall?.quelle).toBe("webformular");
    expect(fall?.organizationId).toBe(orgId);
    expect(fall?.caseNumber).toMatch(/^UP-\d{4}-\d{4,}$/);
    expect(fall?.applicants).toHaveLength(1);
    expect(fall?.applicants[0]?.nachname).toBe("Mustermann");
    expect(fall?.applicants[0]?.email).toBe("max@example.de");
    expect(fall?.applicants[0]?.phone).toBe("0170 1234567");
    // Property-Zweig: nur hier prüfbar, weder die Attrappen-Tests noch
    // selbstauskunft-db.test.ts fragen jemals Objektdaten ab.
    expect(fall?.property?.city).toBe("München");
    expect(fall?.property?.zip).toBe("80331");
    expect(fall?.financingRequest?.kaufpreis).toBe(400000);
    // Case-Zweig: Beleg, dass "vorhaben.art" wirklich im Fall landet
    // und nicht mehr im gemeinsamen Schreibkern verschwindet.
    expect(fall?.financingType).toBe("kauf");

    const bogenDanach = await prisma.selfDisclosure.findUnique({ where: { id: bogen.id } });
    expect(bogenDanach?.caseId).toBe(fallId);
    expect(bogenDanach?.einwilligungFassung).toBeTruthy();
    expect(bogenDanach?.takenOverAt).not.toBeNull();
  }, 60_000);

  it("legt bei zwei Antragstellern auch den zweiten an", async () => {
    const { gebaereFall } = await import("@/lib/leadformular/fallgeburt");

    const link = await prisma.selfDisclosureLink.create({
      data: { formularId: formular.id, tokenHash: "hash-2", expiresAt: new Date(Date.now() + 86400_000) },
    });
    const antworten = {
      ...antwortenEinerPerson(),
      "haushalt.anzahl": "2",
      "p2.personen.nachname": "Musterfrau",
    };
    const bogen = await prisma.selfDisclosure.create({ data: { linkId: link.id, answers: antworten } });

    const fallId = await gebaereFall(bogen.id, antworten, formular, new Date());

    const fall = await prisma.case.findUnique({
      where: { id: fallId },
      include: { applicants: { orderBy: { position: "asc" } } },
    });
    expect(fall?.applicants).toHaveLength(2);
    expect(fall?.applicants[0]?.nachname).toBe("Mustermann");
    expect(fall?.applicants[1]?.nachname).toBe("Musterfrau");
  }, 60_000);
});
