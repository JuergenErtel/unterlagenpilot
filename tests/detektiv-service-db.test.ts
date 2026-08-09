import { describe, it, expect, beforeAll } from "vitest";

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Abgleichslauf gegen das echte Schema.
 *   RUN_DB_IT=1 npx vitest run tests/detektiv-service-db.test.ts
 */
describe.runIf(RUN)("Detektiv-Abgleichslauf (PGlite)", () => {
  let prisma: any;
  let caseId: string;
  let grundbuchId: string;
  let reconcileCase: (id: string, jetzt?: Date) => Promise<{ angelegt: number; erledigt: number }>;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();

    const org = await prisma.organization.create({ data: { name: "Test", slug: "testorg-detektiv" } });
    const c = await prisma.case.create({
      data: { organizationId: org.id, caseNumber: "UP-TEST-0001" },
    });
    caseId = c.id;

    const doc = await prisma.document.create({
      data: {
        caseId,
        originalName: "grundbuch.pdf",
        storageKey: "k1",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uploadSource: "vermittler",
        documentType: "grundbuchauszug",
        pageCount: 3,
      },
    });
    grundbuchId = doc.id;

    ({ reconcileCase } = await import("@/lib/detektiv/service"));
  }, 180_000);

  it("legt fuer einen nicht vorhandenen Nachtrag einen offenen Befund an", async () => {
    await prisma.documentReference.create({
      data: {
        documentId: grundbuchId,
        caseId,
        kind: "nachtrag",
        label: "2. Nachtrag zur Teilungserklärung",
        urkundenNummer: "789/2011",
        urkundeDatum: new Date("2011-08-11"),
        sourcePage: 3,
        sourceQuote: "2. Nachtrag vom 11.08.2011",
      },
    });

    const r = await reconcileCase(caseId);
    expect(r.angelegt).toBe(1);

    const funde = await prisma.caseFinding.findMany({ where: { caseId } });
    expect(funde).toHaveLength(1);
    expect(funde[0].status).toBe("offen");
    expect(funde[0].title).toContain("789/2011");
    expect(funde[0].sourceQuote).toBe("2. Nachtrag vom 11.08.2011");
  });

  it("legt beim zweiten Lauf keinen zweiten Befund an", async () => {
    const r = await reconcileCase(caseId);
    expect(r.angelegt).toBe(0);
    expect(await prisma.caseFinding.count({ where: { caseId } })).toBe(1);
  });

  it("holt einen verworfenen Befund nicht zurueck", async () => {
    await prisma.caseFinding.updateMany({ where: { caseId }, data: { status: "verworfen" } });
    await reconcileCase(caseId);
    const funde = await prisma.caseFinding.findMany({ where: { caseId } });
    expect(funde).toHaveLength(1);
    expect(funde[0].status).toBe("verworfen");
  });

  it("erledigt einen Befund von selbst, sobald die Urkunde auftaucht", async () => {
    await prisma.caseFinding.updateMany({ where: { caseId }, data: { status: "offen" } });

    const nachtrag = await prisma.document.create({
      data: {
        caseId,
        originalName: "nachtrag2.pdf",
        storageKey: "k2",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uploadSource: "kunde",
        documentType: "teilungserklaerung",
        pageCount: 4,
      },
    });
    await prisma.documentReference.create({
      data: {
        documentId: nachtrag.id,
        caseId,
        kind: "selbst",
        label: "2. Nachtrag zur Teilungserklärung",
        urkundenNummer: "789/2011",
        urkundeDatum: new Date("2011-08-11"),
        sourcePage: 1,
        sourceQuote: "Nachtrag Nr. 2, UR-Nr. 789/2011",
      },
    });

    const r = await reconcileCase(caseId);
    expect(r.erledigt).toBe(1);
    const fund = await prisma.caseFinding.findFirst({ where: { caseId } });
    expect(fund.status).toBe("erledigt");
  });

  it("oeffnet einen Befund wieder, wenn die freigegebene Position geloescht wurde", async () => {
    const item = await prisma.caseChecklistItem.create({
      data: { caseId, key: "detektiv.x", name: "Testposition", status: "offen" },
    });
    await prisma.caseFinding.updateMany({
      where: { caseId },
      data: { status: "freigegeben", checklistItemId: item.id },
    });
    await prisma.caseChecklistItem.delete({ where: { id: item.id } });

    await reconcileCase(caseId);
    const fund = await prisma.caseFinding.findFirst({ where: { caseId } });
    expect(fund.status).toBe("offen");
    expect(fund.checklistItemId).toBeNull();
  });
});
