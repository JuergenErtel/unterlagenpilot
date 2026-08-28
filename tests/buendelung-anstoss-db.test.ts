import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
  // Ohne diese Zeile liest processOcrAndAi das lokale .env (OCR_PROVIDER=
  // "mistral") und versucht einen echten HTTP-Aufruf - hier faellt das erst
  // beim ersten Test auf, der die volle Pipeline (analysiereDokument) durchlaeuft.
  process.env.OCR_PROVIDER = "mock";
});

// Nur fuer den Test zu Finding 1 (Fix-Runde 1): reconcileCase soll werfen,
// waehrend runReferenceExtraction echt bleibt. Damit laesst sich pruefen, ob
// der Buendel-Anstoss eine eigene Fehlergrenze hat und NICHT mitgerissen
// wird, wenn der Unterlagen-Detektiv-Abgleich scheitert.
vi.mock("@/lib/detektiv/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/detektiv/service")>();
  return {
    ...actual,
    reconcileCase: vi.fn().mockRejectedValue(new Error("reconcileCase kaputt (Testfixture)")),
  };
});

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(RUN)("Anstoß des Bündel-Laufs (PGlite)", () => {
  let prisma: any;
  let orgId: string;
  let starteBuendelLaufWennFertig: (caseId: string, documentId: string) => Promise<void>;
  let erkenneAufteilung: (documentId: string) => Promise<void>;
  let analysiereDokument: (documentId: string) => Promise<void>;
  let storage: any;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-buendel-anstoss" } });
    orgId = org.id;
    ({ starteBuendelLaufWennFertig } = await import("@/lib/buendelung/service"));
    ({ erkenneAufteilung } = await import("@/lib/aufteilung/service"));
    ({ analysiereDokument } = await import("@/lib/documents/pipeline"));
    storage = (await import("@/lib/storage")).getStorage();
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

  // Fix-Runde 1, Finding 1: reconcileCase (Unterlagen-Detektiv-Abgleich) ist
  // NICHT intern abgesichert. Wirft es, darf der Buendel-Anstoss trotzdem
  // laufen - sonst bliebe der Fall fuer immer auf "ausstehend" haengen, ohne
  // dass irgendwo ein Fehler sichtbar wird.
  it("stoesst den Buendel-Lauf auch an, wenn reconcileCase (Detektiv-Abgleich) wirft", async () => {
    const caseId = await fallAnlegen();
    await seite(caseId, 0);

    // Das zweite Dokument durchlaeuft die ECHTE Pipeline (analysiereDokument),
    // nicht nur ein direkt angelegter DB-Datensatz - nur so greift der im Test
    // gemockte reconcileCase-Wurf ueberhaupt.
    const text =
      "Gehaltsabrechnung Seite 2 von 3 - Bruttogehalt 3.500,00 EUR, Auszahlung netto ueberwiesen.";
    const buffer = Buffer.from(text, "utf-8");
    const stored = await storage.put({
      organizationId: orgId,
      caseId,
      originalName: "letzte.jpg",
      mimeType: "image/jpeg",
      buffer,
    });
    const letzte = await prisma.document.create({
      data: {
        caseId,
        originalName: "letzte.jpg",
        storageKey: stored.storageKey,
        mimeType: "image/jpeg",
        sizeBytes: buffer.byteLength,
        uploadSource: "kunde",
        scanStatus: "virus_scan_clean",
      },
    });

    await analysiereDokument(letzte.id);

    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(1);
  });

  // Fix-Runde 1, Finding 2: ein hart gestorbener Hintergrundlauf (Deploy,
  // Function-Timeout) darf die Buendelung nicht fuer immer verhindern - aber
  // ein wirklich noch laufender Nachbar muss weiterhin blockieren. Beide
  // Richtungen in einem Test, damit keine der beiden versehentlich unbewiesen
  // bleibt.
  it("nur ein FRISCHES 'laeuft' beim Nachbarn blockiert - ein veraltetes nicht mehr", async () => {
    // Fall A: der Nachbar haengt seit ueber der Alters-Schwelle
    // (AI_CHECK_STALE_MS = 10 Minuten) auf "laeuft" - vermutlich hart
    // gestorben. Das darf den Lauf nicht mehr blockieren.
    const veraltetFall = await fallAnlegen();
    const veralteterNachbar = await seite(veraltetFall, 0, { classificationStatus: "laeuft" });
    await prisma.document.update({
      where: { id: veralteterNachbar.id },
      data: { updatedAt: new Date(Date.now() - 11 * 60_000) },
    });
    const letzteVeraltet = await seite(veraltetFall, 1);
    await starteBuendelLaufWennFertig(veraltetFall, letzteVeraltet.id);
    expect(await prisma.documentBuendel.count({ where: { caseId: veraltetFall } })).toBe(1);

    // Fall B (Kontrolle, derselbe Status): frisch auf "laeuft" - blockiert
    // weiterhin wie gehabt.
    const frischFall = await fallAnlegen();
    await seite(frischFall, 0, { classificationStatus: "laeuft" });
    const letzteFrisch = await seite(frischFall, 1);
    await starteBuendelLaufWennFertig(frischFall, letzteFrisch.id);
    expect(await prisma.documentBuendel.count({ where: { caseId: frischFall } })).toBe(0);
  });
});
