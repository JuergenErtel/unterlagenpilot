import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

const RUN = process.env.RUN_DB_IT === "1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

/**
 * Der Colell-Ablauf gegen das echte Schema: Fall mit einer Person, Dokumente
 * hochgeladen, zweite Person kommt später mit Namen dazu.
 *
 * Standardmäßig übersprungen (PGlite/WASM ist schwer). Gezielt ausführen mit:
 *   RUN_DB_IT=1 npx vitest run tests/applicant-rematch-db.test.ts
 */
describe.runIf(RUN)("rematchCaseDocuments (PGlite)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let caseId: string;
  let laura: string;
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
    // Cast wegen doppelter @prisma/driver-adapter-utils-Kopie (nur Typ-Skew).
    const adapter = new PrismaPGlite(pg) as never;
    prisma = new PrismaClient({ adapter });
    g.prisma = prisma;

    const org = await prisma.organization.create({ data: { name: "Testorg", slug: "testorg-rematch" } });
    orgId = org.id;
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-2026-9001", status: "unterlagen_fehlen" },
    });
    caseId = c.id;
    const a1 = await prisma.applicant.create({
      data: { caseId, position: 1, vorname: "Laura", nachname: "Colell" },
    });
    laura = a1.id;

    const basis = {
      caseId,
      storageKey: "k",
      mimeType: "application/pdf",
      sizeBytes: 10,
      uploadSource: "kunde" as const,
      applicantId: laura,
      applicantSource: "auto",
    };
    await prisma.document.createMany({
      data: [
        { ...basis, originalName: "perso-thomas.pdf", documentType: "personalausweis", detectedApplicant: "Thomas Colell" },
        { ...basis, originalName: "perso-laura.pdf", documentType: "personalausweis", detectedApplicant: "Laura Colell" },
        { ...basis, originalName: "ohne-namen.pdf", documentType: "sonstige", detectedApplicant: null },
        { ...basis, originalName: "hand-zugeordnet.pdf", documentType: "personalausweis", detectedApplicant: "Thomas Colell", applicantSource: "manuell" },
      ],
    });
  }, 180_000);

  it(
    "hängt nach dem Anlegen des zweiten Antragstellers nur die passenden Dokumente um",
    async () => {
      const a2 = await prisma.applicant.create({
        data: { caseId, position: 2, vorname: "Thomas", nachname: "Colell" },
      });
      const { rematchCaseDocuments } = await import("@/lib/documents/rematch");
      const count = await rematchCaseDocuments(caseId, { organizationId: orgId, userId: null });
      expect(count).toBe(1);

      const byName = async (name: string) =>
        prisma.document.findFirst({ where: { caseId, originalName: name } });

      expect((await byName("perso-thomas.pdf")).applicantId).toBe(a2.id);
      expect((await byName("perso-thomas.pdf")).generatedName).toContain("Thomas");
      expect((await byName("perso-laura.pdf")).applicantId).toBe(laura);
      // Kein erkannter Name: bestehende Zuordnung bleibt, die Checkliste läuft nie rückwärts.
      expect((await byName("ohne-namen.pdf")).applicantId).toBe(laura);
      // Handzuordnung des Vermittlers bleibt unangetastet.
      expect((await byName("hand-zugeordnet.pdf")).applicantId).toBe(laura);
    },
    120_000
  );
});
