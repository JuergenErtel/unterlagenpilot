import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
});

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(RUN)("Anstoß des Bündel-Laufs (PGlite)", () => {
  let prisma: any;
  let orgId: string;
  let starteBuendelLaufWennFertig: (caseId: string, documentId: string) => Promise<void>;
  let erkenneAufteilung: (documentId: string) => Promise<void>;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-buendel-anstoss" } });
    orgId = org.id;
    ({ starteBuendelLaufWennFertig } = await import("@/lib/buendelung/service"));
    ({ erkenneAufteilung } = await import("@/lib/aufteilung/service"));
  }, 180_000);

  let nr = 0;
  const fallAnlegen = async () =>
    (await prisma.case.create({ data: { organizationId: orgId, caseNumber: `UP-TEST-BA${++nr}` } })).id;

  const seite = async (caseId: string, i: number, over: Record<string, unknown> = {}) => {
    const d = await prisma.document.create({
      data: {
        caseId,
        originalName: `IMG_${i}.jpg`,
        storageKey: `t/${caseId}/${i}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        uploadSource: "kunde",
        pageCount: 1,
        scanStatus: "virus_scan_clean",
        ocrStatus: "fertig",
        classificationStatus: "fertig",
        extractionStatus: "fertig",
        readable: true,
        ...over,
      },
    });
    await prisma.documentPage.create({
      data: { documentId: d.id, pageNumber: 1, ocrText: `Gehaltsabrechnung Seite ${i + 1} von 3` },
    });
    return d;
  };

  it("startet den Lauf, wenn keine Analyse mehr laeuft", async () => {
    const caseId = await fallAnlegen();
    await seite(caseId, 0);
    const letzte = await seite(caseId, 1);
    await starteBuendelLaufWennFertig(caseId, letzte.id);
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(1);
  });

  it("wartet, solange ein Nachbardokument noch analysiert wird", async () => {
    const caseId = await fallAnlegen();
    await seite(caseId, 0, { classificationStatus: "laeuft" });
    const fertig = await seite(caseId, 1);
    await starteBuendelLaufWennFertig(caseId, fertig.id);
    // Der Nachbar macht das Licht aus, nicht dieses Dokument.
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(0);
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    expect(c.buendelStatus).toBe("ausstehend");
  });

  it("das eigene Dokument zaehlt nicht als laufender Nachbar", async () => {
    const caseId = await fallAnlegen();
    await seite(caseId, 0);
    // Das gerade fertig gewordene Dokument traegt in der Datenbank
    // moeglicherweise noch "laeuft" - es darf sich nicht selbst blockieren.
    const selbst = await seite(caseId, 1, { extractionStatus: "laeuft" });
    await starteBuendelLaufWennFertig(caseId, selbst.id);
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(1);
  });

  it("ein zusammengefuegtes Dokument wird nicht auf Aufteilung geprueft", async () => {
    const caseId = await fallAnlegen();
    const quelle = await seite(caseId, 0);
    const ziel = await prisma.document.create({
      data: {
        caseId,
        originalName: "gebuendelt.pdf",
        storageKey: `t/${caseId}/gebuendelt.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 500,
        uploadSource: "kunde",
        pageCount: 4,
        scanStatus: "virus_scan_clean",
        ocrStatus: "fertig",
      },
    });
    for (let i = 1; i <= 4; i++) {
      await prisma.documentPage.create({
        data: { documentId: ziel.id, pageNumber: i, ocrText: `Seite ${i} von 4` },
      });
    }
    await prisma.document.update({ where: { id: quelle.id }, data: { zusammengefuegtInId: ziel.id } });

    await erkenneAufteilung(ziel.id);

    // Sonst schluege die Aufteilung sofort vor, das gerade Gebuendelte wieder
    // zu zerlegen.
    expect(await prisma.documentSplitSegment.count({ where: { documentId: ziel.id } })).toBe(0);
    const nachher = await prisma.document.findUnique({ where: { id: ziel.id } });
    expect(nachher.splitStatus).toBe("fertig");
  });
});
