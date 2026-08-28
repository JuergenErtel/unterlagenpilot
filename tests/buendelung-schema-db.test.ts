import { describe, it, expect, beforeAll, vi } from "vitest";

// Mock-Provider und lokalen Speicher erzwingen, BEVOR ein Import greift.
vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
});

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(RUN)("Bündelung: Datenmodell (PGlite)", () => {
  let prisma: any;
  let caseId: string;
  let orgId: string;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-buendel-schema" } });
    orgId = org.id;
    const c = await prisma.case.create({ data: { organizationId: orgId, caseNumber: "UP-TEST-B001" } });
    caseId = c.id;
  }, 180_000);

  const seiteAnlegen = async (name: string) =>
    prisma.document.create({
      data: {
        caseId,
        originalName: name,
        storageKey: `t/${name}`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        uploadSource: "kunde",
        pageCount: 1,
        scanStatus: "virus_scan_clean",
      },
    });

  it("ein neuer Fall ist noch nicht auf Bündel geprüft", async () => {
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    // "ausstehend" heisst NICHT "nichts gefunden" - der Unterschied ist der
    // ganze Zweck des eigenen Status.
    expect(c.buendelStatus).toBe("ausstehend");
    expect(c.buendelStatusAm).toBeNull();
  });

  it("ein Bündelvorschlag haelt seine Seiten in Reihenfolge", async () => {
    const a = await seiteAnlegen("a.jpg");
    const b = await seiteAnlegen("b.jpg");
    const buendel = await prisma.documentBuendel.create({
      data: {
        caseId,
        reihenfolge: 0,
        titel: "Gehaltsabrechnung 05/2026",
        vermuteterTyp: "gehaltsabrechnung",
        confidence: 0.9,
        seiten: { create: [{ documentId: b.id, position: 0 }, { documentId: a.id, position: 1 }] },
      },
      include: { seiten: { orderBy: { position: "asc" } } },
    });
    // b vor a: die Reihenfolge kommt aus der KI, nicht aus der Uploadzeit.
    expect(buendel.seiten.map((s: any) => s.documentId)).toEqual([b.id, a.id]);
  });

  it("dieselbe Seite kann nicht zweimal im selben Bündel stehen", async () => {
    const a = await seiteAnlegen("c.jpg");
    const buendel = await prisma.documentBuendel.create({
      data: { caseId, reihenfolge: 1, titel: "X", seiten: { create: [{ documentId: a.id, position: 0 }] } },
    });
    await expect(
      prisma.documentBuendelSeite.create({ data: { buendelId: buendel.id, documentId: a.id, position: 1 } })
    ).rejects.toThrow();
  });

  it("eine Quellseite zeigt auf ihr Zieldokument", async () => {
    const quelle = await seiteAnlegen("d.jpg");
    const ziel = await prisma.document.create({
      data: {
        caseId,
        originalName: "gebuendelt.pdf",
        storageKey: "t/gebuendelt.pdf",
        mimeType: "application/pdf",
        sizeBytes: 200,
        uploadSource: "kunde",
        pageCount: 2,
        scanStatus: "virus_scan_clean",
      },
    });
    await prisma.document.update({
      where: { id: quelle.id },
      data: { zusammengefuegtInId: ziel.id, reviewStatus: "ersetzt" },
    });
    const mitQuellen = await prisma.document.findUnique({
      where: { id: ziel.id },
      include: { quellseiten: true },
    });
    expect(mitQuellen.quellseiten).toHaveLength(1);
    expect(mitQuellen.quellseiten[0].id).toBe(quelle.id);
  });
});
