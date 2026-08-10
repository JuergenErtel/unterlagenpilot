import { describe, it, expect, beforeAll, vi } from "vitest";

// Mock-Provider erzwingen, bevor irgendein Import greift – siehe
// tests/aufteilung-service-db.test.ts.
vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
});

// after() gibt es nur im Request-Kontext; hier wird die Hintergrundanalyse
// bewusst nicht ausgefuehrt – geprueft wird das Auftrennen selbst.
vi.mock("next/server", () => ({ after: () => undefined }));

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Erzeugt ein echtes, mehrseitiges PDF mit dem vorhandenen pdfkit. */
async function baueTestPdf(seiten: number): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const teile: Buffer[] = [];
    doc.on("data", (d: Buffer) => teile.push(d));
    doc.on("end", () => resolve(Buffer.concat(teile)));
    doc.on("error", reject);
    for (let i = 1; i <= seiten; i++) {
      doc.addPage().text(`Seite ${i}`);
    }
    doc.end();
  });
}

describe.runIf(RUN)("Auftrennen (PGlite)", () => {
  let prisma: any;
  let caseId: string;
  let orgId: string;
  let teileAuf: (id: string, orgId: string) => Promise<{ ok: boolean; anzahl?: number; grund?: string }>;
  let storage: any;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-teilen" } });
    orgId = org.id;
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: "UP-TEST-0003" },
    });
    caseId = c.id;
    ({ teileAuf } = await import("@/lib/aufteilung/service"));
    storage = (await import("@/lib/storage")).getStorage();
  }, 180_000);

  const stapelAnlegen = async () => {
    const buffer = await baueTestPdf(8);
    const stored = await storage.put({
      organizationId: orgId,
      caseId,
      originalName: "sammel.pdf",
      mimeType: "application/pdf",
      buffer,
    });
    const doc = await prisma.document.create({
      data: {
        caseId,
        originalName: "sammel.pdf",
        storageKey: stored.storageKey,
        mimeType: "application/pdf",
        sizeBytes: buffer.byteLength,
        uploadSource: "kunde",
        pageCount: 8,
        scanStatus: "virus_scan_clean",
        splitStatus: "fertig",
      },
    });
    await prisma.documentSplitSegment.createMany({
      data: [
        { documentId: doc.id, reihenfolge: 0, vonSeite: 1, bisSeite: 2, vermuteterTyp: "personalausweis", titel: "Personalausweis", confidence: 0.95 },
        { documentId: doc.id, reihenfolge: 1, vonSeite: 3, bisSeite: 5, vermuteterTyp: "gehaltsabrechnung", titel: "Gehaltsabrechnung", confidence: 0.9 },
        { documentId: doc.id, reihenfolge: 2, vonSeite: 6, bisSeite: 8, vermuteterTyp: "grundbuchauszug", titel: "Grundbuchauszug", confidence: 0.9 },
      ],
    });
    return doc.id as string;
  };

  it("erzeugt aus acht Seiten drei Dokumente mit den richtigen Seitenzahlen", async () => {
    const id = await stapelAnlegen();
    const r = await teileAuf(id, orgId);
    expect(r.ok).toBe(true);
    expect(r.anzahl).toBe(3);

    const kinder = await prisma.document.findMany({
      where: { aufgeteiltAusId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(kinder).toHaveLength(3);
    expect(kinder.map((k: any) => k.pageCount).sort()).toEqual([2, 3, 3]);
  });

  it("markiert das Original als ersetzt und behaelt es als Spur", async () => {
    const id = await stapelAnlegen();
    await teileAuf(id, orgId);
    const original = await prisma.document.findUnique({ where: { id } });
    expect(original).not.toBeNull();
    expect(original.reviewStatus).toBe("ersetzt");
  });

  it("vererbt den Virenscan-Status – dieselben Bytes werden nicht neu geprueft", async () => {
    const id = await stapelAnlegen();
    await teileAuf(id, orgId);
    const kinder = await prisma.document.findMany({ where: { aufgeteiltAusId: id } });
    for (const k of kinder) expect(k.scanStatus).toBe("virus_scan_clean");
  });

  it("raeumt den Vorschlag nach dem Auftrennen weg", async () => {
    const id = await stapelAnlegen();
    await teileAuf(id, orgId);
    expect(await prisma.documentSplitSegment.count({ where: { documentId: id } })).toBe(0);
  });

  it("lehnt ein Dokument ohne Vorschlag ab", async () => {
    const doc = await prisma.document.create({
      data: {
        caseId,
        originalName: "einzeln.pdf",
        storageKey: "k-einzeln",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uploadSource: "kunde",
        pageCount: 3,
      },
    });
    const r = await teileAuf(doc.id, orgId);
    expect(r.ok).toBe(false);
  });

  it("veraendert nichts, wenn die Datei nicht im Speicher liegt", async () => {
    const doc = await prisma.document.create({
      data: {
        caseId,
        originalName: "weg.pdf",
        storageKey: "gibt-es-nicht",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uploadSource: "kunde",
        pageCount: 8,
      },
    });
    await prisma.documentSplitSegment.createMany({
      data: [
        { documentId: doc.id, reihenfolge: 0, vonSeite: 1, bisSeite: 4, vermuteterTyp: "personalausweis", titel: "A", confidence: 0.9 },
        { documentId: doc.id, reihenfolge: 1, vonSeite: 5, bisSeite: 8, vermuteterTyp: "grundbuchauszug", titel: "B", confidence: 0.9 },
      ],
    });
    const r = await teileAuf(doc.id, orgId);
    expect(r.ok).toBe(false);

    // Nichts angefasst: kein Kind, Original unveraendert, Vorschlag noch da.
    expect(await prisma.document.count({ where: { aufgeteiltAusId: doc.id } })).toBe(0);
    const original = await prisma.document.findUnique({ where: { id: doc.id } });
    expect(original.reviewStatus).toBe("offen");
    expect(await prisma.documentSplitSegment.count({ where: { documentId: doc.id } })).toBe(2);
  });
});
