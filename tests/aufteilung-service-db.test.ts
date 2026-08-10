import { describe, it, expect, beforeAll, vi } from "vitest";

// Erzwingt den Mock-Provider, BEVOR irgendein Import greift: getEnv() und die
// Provider-Factory speichern beim ersten Aufruf zwischen. Ohne das spricht
// dieser Test die echte Mistral-API an – langsam, kostenpflichtig und nicht
// reproduzierbar.
vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
});

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Erkennungslauf gegen das echte Schema.
 *   RUN_DB_IT=1 npx vitest run tests/aufteilung-service-db.test.ts
 */
describe.runIf(RUN)("Aufteilungserkennung (PGlite)", () => {
  let prisma: any;
  let caseId: string;
  let erkenneAufteilung: (id: string) => Promise<void>;

  const dokumentMitSeiten = async (n: number, mime = "application/pdf") => {
    const doc = await prisma.document.create({
      data: {
        caseId,
        originalName: "sammel.pdf",
        storageKey: `k-${Math.random()}`,
        mimeType: mime,
        sizeBytes: 1,
        uploadSource: "kunde",
        pageCount: n,
        ocrStatus: "fertig",
        pages: {
          create: Array.from({ length: n }, (_, i) => ({
            pageNumber: i + 1,
            ocrText: `Seite ${i + 1} von ${n} – Beispielinhalt eines Sammel-PDFs`,
          })),
        },
      },
    });
    return doc.id as string;
  };

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-aufteilung" } });
    const c = await prisma.case.create({
      data: { organizationId: org.id, caseNumber: "UP-TEST-0002" },
    });
    caseId = c.id;
    ({ erkenneAufteilung } = await import("@/lib/aufteilung/service"));
  }, 180_000);

  it("legt bei einem Mehr-Dokumente-Stapel Segmente an", async () => {
    const id = await dokumentMitSeiten(8);
    await erkenneAufteilung(id);

    const segmente = await prisma.documentSplitSegment.findMany({ where: { documentId: id } });
    expect(segmente.length).toBeGreaterThanOrEqual(2);
    const doc = await prisma.document.findUnique({ where: { id } });
    expect(doc.splitStatus).toBe("fertig");
  });

  it("prueft ein zweiseitiges Dokument gar nicht erst", async () => {
    const id = await dokumentMitSeiten(2);
    await erkenneAufteilung(id);
    expect(await prisma.documentSplitSegment.count({ where: { documentId: id } })).toBe(0);
    const doc = await prisma.document.findUnique({ where: { id } });
    // Geprueft und nichts zu tun ist KEIN Fehler.
    expect(doc.splitStatus).toBe("fertig");
  });

  it("prueft Bilddateien nicht – die lassen sich nicht auftrennen", async () => {
    const id = await dokumentMitSeiten(8, "image/jpeg");
    await erkenneAufteilung(id);
    expect(await prisma.documentSplitSegment.count({ where: { documentId: id } })).toBe(0);
  });

  it("legt beim zweiten Lauf keine doppelten Segmente an", async () => {
    const id = await dokumentMitSeiten(8);
    await erkenneAufteilung(id);
    const ersteAnzahl = await prisma.documentSplitSegment.count({ where: { documentId: id } });
    await erkenneAufteilung(id);
    expect(await prisma.documentSplitSegment.count({ where: { documentId: id } })).toBe(ersteAnzahl);
  });
});
