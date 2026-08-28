import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "local";
});
vi.mock("next/server", () => ({ after: () => undefined }));

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Echtes 800x1200-JPEG aus tests/fixtures - kein Bild-Encoder im Test noetig. */
const jpeg = () => readFileSync(join(process.cwd(), "tests", "fixtures", "seite-hoch.jpg"));

const RUN = process.env.RUN_DB_IT === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe.runIf(RUN)("Bündelung rückgängig machen (PGlite)", () => {
  let prisma: any;
  let orgId: string;
  let storage: any;
  let fuegeZusammen: (input: any) => Promise<any>;
  let macheRueckgaengig: (documentId: string, orgId: string) => Promise<any>;

  beforeAll(async () => {
    const { startPGlite } = await import("./helpers/pglite-setup");
    prisma = await startPGlite();
    const org = await prisma.organization.create({ data: { name: "T", slug: "t-buendel-zurueck" } });
    orgId = org.id;
    ({ fuegeZusammen, macheRueckgaengig } = await import("@/lib/buendelung/service"));
    storage = (await import("@/lib/storage")).getStorage();
  }, 180_000);

  let nr = 0;
  async function gebuendelterFall() {
    const c = await prisma.case.create({
      data: { organizationId: orgId, caseNumber: `UP-TEST-BR${++nr}`, buendelStatus: "fertig" },
    });
    const seiten = [];
    for (const name of ["a.jpg", "b.jpg"]) {
      const buffer = jpeg();
      const stored = await storage.put({ organizationId: orgId, caseId: c.id, originalName: name, mimeType: "image/jpeg", buffer });
      seiten.push(
        await prisma.document.create({
          data: {
            caseId: c.id,
            originalName: name,
            storageKey: stored.storageKey,
            mimeType: "image/jpeg",
            sizeBytes: buffer.byteLength,
            uploadSource: "kunde",
            pageCount: 1,
            scanStatus: "virus_scan_clean",
            ocrStatus: "fertig",
            readable: true,
          },
        })
      );
    }
    const ergebnis = await fuegeZusammen({
      caseId: c.id,
      organizationId: orgId,
      documentIds: seiten.map((s: any) => s.id),
      titel: "Gehaltsabrechnung",
    });
    return { caseId: c.id, seiten, zielId: ergebnis.documentId };
  }

  it("stellt den Ausgangszustand her", async () => {
    const { caseId, seiten, zielId } = await gebuendelterFall();
    const ziel = await prisma.document.findUnique({ where: { id: zielId } });

    const ergebnis = await macheRueckgaengig(zielId, orgId);
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.seiten).toBe(2);

    expect(await prisma.document.findUnique({ where: { id: zielId } })).toBeNull();
    expect(await storage.get(ziel.storageKey)).toBeNull();

    for (const s of seiten) {
      const zurueck = await prisma.document.findUnique({ where: { id: s.id } });
      expect(zurueck.reviewStatus).toBe("offen");
      expect(zurueck.zusammengefuegtInId).toBeNull();
    }

    const c = await prisma.case.findUnique({ where: { id: caseId } });
    // Ein neuer Lauf muss moeglich sein - sonst waeren die Seiten frei, aber
    // niemand wuerde sie mehr ansehen.
    expect(c.buendelStatus).toBe("ausstehend");
  });

  it("weist ein bereits freigegebenes Dokument ab", async () => {
    const { zielId } = await gebuendelterFall();
    await prisma.document.update({ where: { id: zielId }, data: { reviewStatus: "akzeptiert" } });
    const ergebnis = await macheRueckgaengig(zielId, orgId);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.grund).toMatch(/freigegeben/i);
  });

  // Schlussbefund 7 (WICHTIG): "bereits freigegeben - bitte zuerst wieder
  // oeffnen" stimmt nur fuer `akzeptiert`. Fuer `abgelehnt`, `duplikat` und
  // `ersetzt` behauptete der bisherige, einzige Text etwas Falsches - der
  // Vermittler haette bei einem Duplikat nach einem "wieder oeffnen" gesucht,
  // das es fuer diesen Status in der Oberflaeche gar nicht gibt.
  it("nennt bei einem abgelehnten Dokument den richtigen Status, nicht 'freigegeben'", async () => {
    const { zielId } = await gebuendelterFall();
    await prisma.document.update({ where: { id: zielId }, data: { reviewStatus: "abgelehnt" } });
    const ergebnis = await macheRueckgaengig(zielId, orgId);
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) {
      expect(ergebnis.grund).toMatch(/abgelehnt/i);
      expect(ergebnis.grund).not.toMatch(/freigegeben/i);
    }
  });

  it("verspricht bei einem als Duplikat markierten Dokument keinen 'wieder oeffnen'-Weg, den es dafuer nicht gibt", async () => {
    const { zielId } = await gebuendelterFall();
    await prisma.document.update({ where: { id: zielId }, data: { reviewStatus: "duplikat" } });
    const ergebnis = await macheRueckgaengig(zielId, orgId);
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) {
      expect(ergebnis.grund).toMatch(/duplikat/i);
      expect(ergebnis.grund).not.toMatch(/freigegeben/i);
      expect(ergebnis.grund).not.toMatch(/wieder öffnen/i);
    }
  });

  it("weist ein Dokument ohne Quellseiten ab", async () => {
    const { seiten } = await gebuendelterFall();
    const ergebnis = await macheRueckgaengig(seiten[0].id, orgId);
    expect(ergebnis.ok).toBe(false);
  });

  it("weist eine fremde Organisation ab", async () => {
    const { zielId } = await gebuendelterFall();
    expect((await macheRueckgaengig(zielId, "fremde-org")).ok).toBe(false);
  });

  it("laesst von zwei gleichzeitigen Rueckgaengig-Aufrufen nur einen gewinnen", async () => {
    // Zwei Tabs, ein Doppelklick: beide lesen denselben "offen"-Stand, bevor
    // die erste Transaktion committet. Ohne Sperre wuerde die zweite auf ein
    // bereits geloeschtes Dokument treffen und eine Exception werfen statt
    // ein sauberes ok:false zurueckzugeben - genau das Muster, gegen das
    // fuegeZusammen mit seinem verplant-Check schon abgesichert ist.
    const { zielId } = await gebuendelterFall();
    const [a, b] = await Promise.all([macheRueckgaengig(zielId, orgId), macheRueckgaengig(zielId, orgId)]);
    const ergebnisse = [a, b];
    expect(ergebnisse.filter((r) => r.ok).length).toBe(1);
    expect(ergebnisse.filter((r) => !r.ok).length).toBe(1);
    expect(await prisma.document.findUnique({ where: { id: zielId } })).toBeNull();
  });
});
