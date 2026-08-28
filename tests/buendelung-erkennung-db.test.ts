import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
});

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(RUN)("Bündel-Erkennung (PGlite)", () => {
  let prisma: any;
  let orgId: string;
  let erkenneBuendel: (caseId: string) => Promise<void>;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-buendel-erk" } });
    orgId = org.id;
    ({ erkenneBuendel } = await import("@/lib/buendelung/service"));
  }, 180_000);

  let nr = 0;
  const fallMitSeiten = async (anzahl: number, over: Record<string, unknown> = {}) => {
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: `UP-TEST-BE${++nr}` },
    });
    for (let i = 0; i < anzahl; i++) {
      const d = await prisma.document.create({
        data: {
          caseId: c.id,
          originalName: `IMG_${i}.jpg`,
          storageKey: `t/${c.id}/${i}.jpg`,
          mimeType: "image/jpeg",
          sizeBytes: 100,
          uploadSource: "kunde",
          pageCount: 1,
          scanStatus: "virus_scan_clean",
          ocrStatus: "fertig",
          readable: true,
          ...over,
        },
      });
      await prisma.documentPage.create({
        data: { documentId: d.id, pageNumber: 1, ocrText: `Gehaltsabrechnung Seite ${i + 1} von ${anzahl}` },
      });
    }
    return c.id;
  };

  it("legt aus dem KI-Vorschlag ein Bündel an", async () => {
    const caseId = await fallMitSeiten(3);
    await erkenneBuendel(caseId);
    const buendel = await prisma.documentBuendel.findMany({
      where: { caseId },
      include: { seiten: { orderBy: { position: "asc" } } },
    });
    expect(buendel).toHaveLength(1);
    expect(buendel[0].seiten).toHaveLength(2);
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    expect(c.buendelStatus).toBe("fertig");
  });

  it("ein zweiter Lauf ersetzt den Vorschlag, statt ihn zu verdoppeln", async () => {
    const caseId = await fallMitSeiten(3);
    await erkenneBuendel(caseId);
    await prisma.case.update({ where: { id: caseId }, data: { buendelStatus: "ausstehend" } });
    await erkenneBuendel(caseId);
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(1);
  });

  it("bei nur einer brauchbaren Seite ist der Lauf fertig und ohne Vorschlag", async () => {
    const caseId = await fallMitSeiten(1);
    await erkenneBuendel(caseId);
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(0);
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    // "fertig" mit null Vorschlaegen ist NICHT dasselbe wie "ausstehend".
    expect(c.buendelStatus).toBe("fertig");
  });

  it("ein zweiter gleichzeitiger Lauf kehrt still um", async () => {
    const caseId = await fallMitSeiten(3);
    await prisma.case.update({
      where: { id: caseId },
      data: { buendelStatus: "laeuft", buendelStatusAm: new Date() },
    });
    await erkenneBuendel(caseId);
    // Der laufende Nachbar bleibt unangetastet - kein zweiter KI-Aufruf.
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(0);
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    expect(c.buendelStatus).toBe("laeuft");
  });

  it("uebernimmt eine seit zehn Minuten haengende Sperre", async () => {
    const caseId = await fallMitSeiten(3);
    await prisma.case.update({
      where: { id: caseId },
      data: { buendelStatus: "laeuft", buendelStatusAm: new Date(Date.now() - 11 * 60_000) },
    });
    await erkenneBuendel(caseId);
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    expect(c.buendelStatus).toBe("fertig");
  });

  it("freigegebene Seiten kommen nicht in den Lauf", async () => {
    const caseId = await fallMitSeiten(3, { reviewStatus: "akzeptiert" });
    await erkenneBuendel(caseId);
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(0);
  });

  // Schlussbefund 3 (WICHTIG): Ein Lauf beansprucht die Sperre, ruft dann die
  // KI (Laufzeit unbestimmt) und schreibt sein Ergebnis, OHNE vorher zu
  // pruefen, ob er die Sperre noch haelt. Braucht ein Lauf laenger als
  // SPERRE_VERFAELLT_MS, darf ein zweiter Aufruf (z. B. "Erneut pruefen") die
  // Sperre zu Recht uebernehmen und selbst abschliessen - der erste, immer
  // noch laufende Lauf darf dessen Ergebnis danach nicht ueberschreiben. Der
  // KI-Aufruf hier wird gespiegelt, um den zweiten Lauf GENAU waehrend der
  // "Laufzeit unbestimmt" des ersten zu simulieren.
  it("ein Lauf, dessen Sperre zwischenzeitlich uebernommen wurde, schreibt sein Ergebnis nicht", async () => {
    const caseId = await fallMitSeiten(3);
    const { aiService } = await import("@/lib/ai");

    const echtesGruppieren = aiService.gruppiereEinzelseiten.bind(aiService);
    const spy = vi.spyOn(aiService, "gruppiereEinzelseiten").mockImplementationOnce(async (seiten) => {
      // Simuliert exakt das Szenario aus Befund 3: waehrend die KI noch
      // "laeuft", vergeht SPERRE_VERFAELLT_MS, ein zweiter Lauf uebernimmt die
      // Sperre und schliesst VOR dem ersten ab.
      await prisma.case.update({
        where: { id: caseId },
        data: { buendelStatus: "fertig", buendelStatusAm: new Date() },
      });
      await prisma.documentBuendel.create({
        data: { caseId, reihenfolge: 0, titel: "Vom zweiten, rechtmaessigen Lauf", confidence: 0.9 },
      });
      return echtesGruppieren(seiten);
    });

    await erkenneBuendel(caseId);
    spy.mockRestore();

    // Der verdraengte (erste) Lauf darf weder den Status noch die Vorschlaege
    // des zweiten, rechtmaessigen Laufs ueberschreiben.
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    expect(c.buendelStatus).toBe("fertig");
    const buendel = await prisma.documentBuendel.findMany({ where: { caseId } });
    expect(buendel).toHaveLength(1);
    expect(buendel[0]!.titel).toBe("Vom zweiten, rechtmaessigen Lauf");
  });

  it("wirft nicht, wenn schon das Setzen der Sperre fehlschlaegt, und laesst den Status unangetastet", async () => {
    const caseId = await fallMitSeiten(3);
    const spy = vi
      .spyOn(prisma.case, "updateMany")
      .mockRejectedValueOnce(new Error("keine Verbindung"));

    await expect(erkenneBuendel(caseId)).resolves.toBeUndefined();
    spy.mockRestore();

    // Die Sperre wurde nie erhalten - wir waren nie der Besitzer des Laufs.
    // "fehler" zu schreiben waere eine Behauptung ueber einen Lauf, der nie
    // stattfand, und koennte einen echten, gleichzeitigen Lauf ueberschreiben.
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    expect(c.buendelStatus).toBe("ausstehend");
    expect(await prisma.documentBuendel.count({ where: { caseId } })).toBe(0);
  });
});
