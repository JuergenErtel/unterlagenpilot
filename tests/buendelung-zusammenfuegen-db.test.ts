import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
});

// after() gibt es nur im Request-Kontext; die Hintergrundanalyse wird hier
// bewusst nicht ausgefuehrt - geprueft wird das Zusammenfuegen selbst.
vi.mock("next/server", () => ({ after: () => undefined }));

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Echtes 800x1200-JPEG aus tests/fixtures - kein Bild-Encoder im Test noetig. */
const jpeg = () => readFileSync(join(process.cwd(), "tests", "fixtures", "seite-hoch.jpg"));

/** Baut ein echtes PDF mit der gewuenschten Seitenzahl - kein Fixture noetig. */
const pdfMitSeiten = async (anzahl: number): Promise<Buffer> => {
  const PDFDocument = (await import("pdfkit")).default;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const teile: Buffer[] = [];
    doc.on("data", (d: Buffer) => teile.push(d));
    doc.on("end", () => resolve(Buffer.concat(teile)));
    doc.on("error", reject);
    for (let i = 0; i < anzahl; i++) doc.addPage().text(`Seite ${i + 1}`);
    doc.end();
  });
};

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(RUN)("Zusammenfügen (PGlite)", () => {
  let prisma: any;
  let orgId: string;
  let storage: any;
  let fuegeZusammen: (input: any) => Promise<any>;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-buendel-fuegen" } });
    orgId = org.id;
    ({ fuegeZusammen } = await import("@/lib/buendelung/service"));
    storage = (await import("@/lib/storage")).getStorage();
  }, 180_000);

  let nr = 0;
  const fallAnlegen = async () =>
    (await prisma.case.create({ data: { organizationId: orgId, caseNumber: `UP-TEST-BZ${++nr}` } })).id;

  const seiteAnlegen = async (
    caseId: string,
    name: string,
    buffer: Buffer,
    mimeType = "image/jpeg",
    // Ueberschreibt einzelne Felder - fuer die Kandidatenpruefung: ein
    // mehrseitiges "Foto" oder eine bereits freigegebene Seite.
    overrides: { pageCount?: number; reviewStatus?: string } = {}
  ) => {
    const stored = await storage.put({ organizationId: orgId, caseId, originalName: name, mimeType, buffer });
    return prisma.document.create({
      data: {
        caseId,
        originalName: name,
        storageKey: stored.storageKey,
        mimeType,
        sizeBytes: buffer.byteLength,
        uploadSource: "kunde",
        pageCount: overrides.pageCount ?? 1,
        scanStatus: "virus_scan_clean",
        scanEngine: "mock",
        ocrStatus: "fertig",
        readable: true,
        reviewStatus: overrides.reviewStatus ?? "offen",
      },
    });
  };

  it("macht aus zwei Fotos ein Dokument und laesst die Quellen stehen", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const b = await seiteAnlegen(caseId, "b.jpg", jpeg());

    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: orgId,
      documentIds: [b.id, a.id],
      titel: "Gehaltsabrechnung 05/2026",
      vermuteterTyp: "gehaltsabrechnung",
    });

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.seiten).toBe(2);

    const neu = await prisma.document.findUnique({
      where: { id: ergebnis.documentId },
      include: { quellseiten: true },
    });
    expect(neu.mimeType).toBe("application/pdf");
    expect(neu.pageCount).toBe(2);
    expect(neu.documentType).toBe("gehaltsabrechnung");
    // Kein zweiter Virenscan: dieselben Bytes wurden bereits geprueft.
    expect(neu.scanStatus).toBe("virus_scan_clean");
    expect(neu.quellseiten).toHaveLength(2);

    // Nichts geloescht - Datensatz und Datei bleiben.
    const quelleA = await prisma.document.findUnique({ where: { id: a.id } });
    expect(quelleA.reviewStatus).toBe("ersetzt");
    expect(quelleA.zusammengefuegtInId).toBe(ergebnis.documentId);
    expect(await storage.get(quelleA.storageKey)).not.toBeNull();
  });

  it("mischt Foto und einseitiges PDF", async () => {
    const caseId = await fallAnlegen();
    const pdfBytes = await pdfMitSeiten(1);
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const b = await seiteAnlegen(caseId, "b.pdf", pdfBytes, "application/pdf");

    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: orgId,
      documentIds: [a.id, b.id],
      titel: "Gemischt",
    });
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.seiten).toBe(2);
  });

  it("scheitert eine Seite, entsteht kein Dokument und kein Muell im Speicher", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const kaputt = await seiteAnlegen(caseId, "kaputt.jpg", Buffer.from("kein Bild"));

    const vorher = await prisma.document.count({ where: { caseId } });
    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: orgId,
      documentIds: [a.id, kaputt.id],
      titel: "Geht nicht",
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.grund).toMatch(/Seite 2/);
    expect(await prisma.document.count({ where: { caseId } })).toBe(vorher);
    // Der Fall bleibt exakt so, wie er war.
    const unveraendert = await prisma.document.findUnique({ where: { id: a.id } });
    expect(unveraendert.reviewStatus).toBe("offen");
    expect(unveraendert.zusammengefuegtInId).toBeNull();
  });

  it("weist eine Seite aus einer fremden Organisation ab", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const b = await seiteAnlegen(caseId, "b.jpg", jpeg());
    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: "fremde-org",
      documentIds: [a.id, b.id],
      titel: "X",
    });
    expect(ergebnis.ok).toBe(false);
  });

  it("weist eine einzelne Seite ab", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const ergebnis = await fuegeZusammen({ caseId, organizationId: orgId, documentIds: [a.id], titel: "X" });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.grund).toMatch(/mindestens zwei/i);
  });

  it("entfernt den zugehoerigen Vorschlag", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const b = await seiteAnlegen(caseId, "b.jpg", jpeg());
    const buendel = await prisma.documentBuendel.create({
      data: {
        caseId,
        reihenfolge: 0,
        titel: "Vorschlag",
        seiten: { create: [{ documentId: a.id, position: 0 }, { documentId: b.id, position: 1 }] },
      },
    });
    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: orgId,
      documentIds: [a.id, b.id],
      titel: "Vorschlag",
      buendelId: buendel.id,
    });
    expect(ergebnis.ok).toBe(true);
    expect(await prisma.documentBuendel.count({ where: { id: buendel.id } })).toBe(0);
  });

  // Ab hier: die Kandidatenpruefung. fuegeZusammen ist ueber eine Server
  // Action mit einer kommagetrennten ID-Liste aus einem Formular erreichbar -
  // dort kann JEDE Dokument-ID des Falls landen, auch eine, die laengst kein
  // Buendel-Kandidat mehr ist. Die Regel muss VOR dem Bauen des PDFs greifen,
  // nicht erst als Nebenwirkung eines spaeteren Fehlers.

  it("weist eine mehrseitige PDF als Quelle ab, bevor irgendetwas gebaut wird", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const mehrseitig = await seiteAnlegen(
      caseId,
      "mehrseitig.pdf",
      await pdfMitSeiten(2),
      "application/pdf",
      { pageCount: 2 }
    );

    const vorher = await prisma.document.count({ where: { caseId } });
    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: orgId,
      documentIds: [a.id, mehrseitig.id],
      titel: "Darf nicht entstehen",
    });

    expect(ergebnis.ok).toBe(false);
    expect(await prisma.document.count({ where: { caseId } })).toBe(vorher);

    // Beide Quellen bleiben exakt so, wie sie waren - kein Datensatz, kein
    // Speicherobjekt wurde je angefasst.
    const unveraendertA = await prisma.document.findUnique({ where: { id: a.id } });
    expect(unveraendertA.reviewStatus).toBe("offen");
    expect(unveraendertA.zusammengefuegtInId).toBeNull();
    const unveraendertB = await prisma.document.findUnique({ where: { id: mehrseitig.id } });
    expect(unveraendertB.reviewStatus).toBe("offen");
    expect(unveraendertB.zusammengefuegtInId).toBeNull();
    expect(await storage.get(unveraendertA.storageKey)).not.toBeNull();
    expect(await storage.get(unveraendertB.storageKey)).not.toBeNull();
  });

  it("weist ein bereits freigegebenes Dokument als Quelle ab, bevor irgendetwas gebaut wird", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const freigegeben = await seiteAnlegen(caseId, "b.jpg", jpeg(), "image/jpeg", { reviewStatus: "akzeptiert" });

    const vorher = await prisma.document.count({ where: { caseId } });
    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: orgId,
      documentIds: [a.id, freigegeben.id],
      titel: "Darf nicht entstehen",
    });

    expect(ergebnis.ok).toBe(false);
    expect(await prisma.document.count({ where: { caseId } })).toBe(vorher);

    const unveraendertA = await prisma.document.findUnique({ where: { id: a.id } });
    expect(unveraendertA.reviewStatus).toBe("offen");
    const unveraendertFreigegeben = await prisma.document.findUnique({ where: { id: freigegeben.id } });
    // Die Freigabe ist eine Entscheidung des Vermittlers - sie bleibt stehen,
    // buendeln haette sie stillschweigend zurueckgenommen.
    expect(unveraendertFreigegeben.reviewStatus).toBe("akzeptiert");
    expect(unveraendertFreigegeben.zusammengefuegtInId).toBeNull();
    expect(await storage.get(unveraendertA.storageKey)).not.toBeNull();
    expect(await storage.get(unveraendertFreigegeben.storageKey)).not.toBeNull();
  });
});
