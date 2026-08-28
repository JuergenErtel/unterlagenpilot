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

/** Echtes 800x1200-JPEG (Hochformat) aus tests/fixtures - kein Bild-Encoder im Test noetig. */
const jpeg = () => readFileSync(join(process.cwd(), "tests", "fixtures", "seite-hoch.jpg"));

/**
 * Echtes 1600x900-JPEG (Querformat). Unterscheidet sich in der Form von
 * `jpeg()` - genau das macht die Seiten im fertigen PDF unterscheidbar
 * (A4 hoch vs. A4 quer), ohne dass der Test in die Pixel schauen muss.
 */
const jpegQuer = () => readFileSync(join(process.cwd(), "tests", "fixtures", "seite-quer.jpg"));

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
    // mehrseitiges "Foto", eine bereits freigegebene Seite oder ein erkannter
    // Zeitraum (Befund 1).
    overrides: { pageCount?: number; reviewStatus?: string; period?: string | null } = {}
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
        period: overrides.period ?? null,
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

  // Schlussbefund 1 (KRITISCH): Die Handauswahl in der Fallakte umgeht
  // istBuendelKandidat NICHT, aber bis zu diesem Fix wurde die Zeitraum-Sperre
  // (pruefeBuendel/zeitraumKonflikt) nur im KI-Pfad geprueft. Ein Vermittler
  // konnte per Handauswahl die Gehaltsabrechnung Mai und Juni anhaken und
  // zusammenfuegen - ein Dokument, gruene Checkliste, zwei fehlende Monate
  // sichtbar erst bei der Bank. Die Regel muss deshalb in fuegeZusammen
  // SELBST greifen, nicht nur bei ihrem einzigen heutigen Aufrufer.

  it("weist zwei Seiten mit verschiedenen Zeitraeumen ab, bevor irgendetwas gebaut wird", async () => {
    const caseId = await fallAnlegen();
    const mai = await seiteAnlegen(caseId, "mai.jpg", jpeg(), "image/jpeg", { period: "2026-05" });
    const juni = await seiteAnlegen(caseId, "juni.jpg", jpeg(), "image/jpeg", { period: "2026-06" });

    const vorher = await prisma.document.count({ where: { caseId } });
    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: orgId,
      documentIds: [mai.id, juni.id],
      titel: "Gehaltsabrechnung",
    });

    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) {
      expect(ergebnis.grund).toMatch(/2026-05/);
      expect(ergebnis.grund).toMatch(/2026-06/);
    }
    // Kein Dokument entstanden, kein Speicherobjekt angefasst - die Pruefung
    // laeuft VOR dem PDF-Bau, genau wie die anderen Kandidaten-Ablehnungen.
    expect(await prisma.document.count({ where: { caseId } })).toBe(vorher);
    const unveraendertMai = await prisma.document.findUnique({ where: { id: mai.id } });
    expect(unveraendertMai.reviewStatus).toBe("offen");
    expect(unveraendertMai.zusammengefuegtInId).toBeNull();
    expect(await storage.get(unveraendertMai.storageKey)).not.toBeNull();
  });

  it("nimmt weiterhin zwei Seiten mit DEMSELBEN Zeitraum an - die Gegenrichtung zur Sperre", async () => {
    // Ohne diesen Test wuerde eine Verschaerfung der Regel oben still auch den
    // Normalfall blockieren: eine mehrseitige Abrechnung EINES Monats, per
    // Hand aus zwei Fotos zusammengefuegt.
    const caseId = await fallAnlegen();
    const seite1 = await seiteAnlegen(caseId, "seite1.jpg", jpeg(), "image/jpeg", { period: "2026-05" });
    const seite2 = await seiteAnlegen(caseId, "seite2.jpg", jpeg(), "image/jpeg", { period: "2026-05" });

    const ergebnis = await fuegeZusammen({
      caseId,
      organizationId: orgId,
      documentIds: [seite1.id, seite2.id],
      titel: "Gehaltsabrechnung 05/2026",
    });

    expect(ergebnis.ok).toBe(true);
  });

  // Der Vorab-Check (istBuendelKandidat) liegt AUSSERHALB der Transaktion, die
  // Seiten anschliessend verplant. Zwei ECHT ueberlappende Aufrufe
  // (Doppelklick, zwei Tabs, KI-Vorschlag und Handauswahl fast gleichzeitig)
  // koennnen beide den Vorab-Check bestehen, bevor einer schreibt - deshalb
  // hier per Promise.all wirklich gleichzeitig gestartet, nicht nacheinander
  // (ein sequenzieller zweiter Aufruf wuerde schon am - laengst vorhandenen -
  // Vorab-Check scheitern und die neue Transaktions-WHERE-Klausel gar nicht
  // pruefen). Ohne die "offen"/unverplant-Bedingung in der Transaktion haette
  // der Verlierer der zweiten Quellseite lautlos den zusammengefuegtInId
  // umgeschrieben und dem Gewinner eine Seite entrissen.
  it("verhindert, dass zwei gleichzeitige Aufrufe dieselbe Quellseite doppelt verplanen", async () => {
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const b = await seiteAnlegen(caseId, "b.jpg", jpeg());

    // Schlussbefund 5: Beide Aufrufe legen ihr PDF im Speicher ab, BEVOR die
    // Transaktions-WHERE-Klausel entscheidet, wer gewinnt (siehe fuegeZusammen).
    // Ohne diesen Spy liesse sich der Speicherschluessel des VERLIERERS nicht
    // ermitteln - das Ergebnisobjekt eines gescheiterten Aufrufs traegt ihn
    // nicht. storage.put wird deshalb hier real ausgefuehrt, aber jeder
    // erzeugte Schluessel zusaetzlich mitgeschrieben.
    const angelegteSchluessel: string[] = [];
    const echtesPut = storage.put.bind(storage);
    const putSpy = vi.spyOn(storage, "put").mockImplementation(async (input: any) => {
      const ergebnis = await echtesPut(input);
      angelegteSchluessel.push(ergebnis.storageKey);
      return ergebnis;
    });

    const [ergebnisA, ergebnisB] = await Promise.all([
      fuegeZusammen({ caseId, organizationId: orgId, documentIds: [a.id, b.id], titel: "Rennen A" }),
      fuegeZusammen({ caseId, organizationId: orgId, documentIds: [a.id, b.id], titel: "Rennen B" }),
    ]);
    putSpy.mockRestore();

    // Genau einer der beiden ueberlappenden Aufrufe darf gewinnen - welcher,
    // ist Zufall und fuer die Zusicherung ohne Belang.
    const erfolge = [ergebnisA, ergebnisB].filter((e) => e.ok);
    expect(erfolge).toHaveLength(1);

    // Es ist nur EIN zusammengefuegtes Dokument entstanden, und das hat
    // beide Quellseiten - keine ging an einen ueberschriebenen zweiten
    // Versuch verloren.
    const erzeugte = await prisma.document.findMany({
      where: { caseId, mimeType: "application/pdf" },
      include: { quellseiten: true },
    });
    expect(erzeugte).toHaveLength(1);
    expect(erzeugte[0].quellseiten).toHaveLength(2);
    expect(erzeugte[0].pageCount).toBe(2);

    // Der Kommentar dieses Tests behauptete bisher "kein Speicherobjekt des
    // Verlierers haengengeblieben", geprueft wurde aber nur, dass der GEWINNER
    // abrufbar ist - das waere auch dann gruen, wenn die Aufraeumzeile in
    // fuegeZusammen ersatzlos entfernt wuerde. Beide Aufrufe haben ein PDF
    // angelegt (siehe Spy oben); der Schluessel, der NICHT der des Gewinners
    // ist, muss nach dem Wettlauf wirklich weg sein.
    expect(angelegteSchluessel).toHaveLength(2);
    const verliererSchluessel = angelegteSchluessel.find((k) => k !== erzeugte[0].storageKey);
    expect(verliererSchluessel).toBeDefined();
    expect(await storage.get(verliererSchluessel!)).toBeNull();
    expect(await storage.get(erzeugte[0].storageKey)).not.toBeNull();
  });

  it("loggt, wenn nach einem verlorenen Wettlauf auch das Aufraeumen im Speicher scheitert", async () => {
    // Schlussbefund 4: Scheitert das storage.remove(...) im catch-Zweig von
    // fuegeZusammen, wurde der Fehler bisher mit `.catch(() => undefined)`
    // stillschweigend verschluckt - der Kommentar "kein Muell im Speicher"
    // war dann schlicht falsch, ohne dass es irgendwo sichtbar wurde.
    const caseId = await fallAnlegen();
    const a = await seiteAnlegen(caseId, "a.jpg", jpeg());
    const b = await seiteAnlegen(caseId, "b.jpg", jpeg());

    const removeSpy = vi
      .spyOn(storage, "remove")
      .mockRejectedValue(new Error("Speicher nicht erreichbar (Testfixture)"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const [ergebnisA, ergebnisB] = await Promise.all([
      fuegeZusammen({ caseId, organizationId: orgId, documentIds: [a.id, b.id], titel: "Rennen A" }),
      fuegeZusammen({ caseId, organizationId: orgId, documentIds: [a.id, b.id], titel: "Rennen B" }),
    ]);
    removeSpy.mockRestore();

    expect([ergebnisA, ergebnisB].filter((e) => e.ok)).toHaveLength(1);

    // Eine eigene Log-Zeile fuer die gescheiterte Aufraeumung, unterscheidbar
    // von der allgemeinen "Zusammenfuegen fehlgeschlagen"-Zeile - sonst weiss
    // niemand, der die Logs liest, dass zusaetzlich ein Objekt liegen blieb.
    expect(errorSpy.mock.calls.some((call) => String(call[0]).includes("nicht entfernt"))).toBe(true);
    errorSpy.mockRestore();
  });

  // Die Seitenreihenfolge ist das ganze Versprechen dieses Features - die KI
  // ordnet durcheinandergeratene Handyfotos neu. Ein still vertauschtes Paar
  // wuerde eine Gehaltsabrechnung zerreissen, ohne dass ein Test es merkt -
  // deshalb hier die tatsaechliche PDF-Geometrie pruefen, nicht nur die
  // Seitenzahl. seite-hoch.jpg (800x1200) wird zu A4 hoch (595x842),
  // seite-quer.jpg (1600x900) zu A4 quer (842x595) - beide Formate
  // unterscheidbar, ohne Pixel vergleichen zu muessen.
  it("haelt die vom Aufrufer gewuenschte Seitenreihenfolge exakt ein", async () => {
    const { PDFDocument } = await import("pdf-lib");

    const caseIdVorwaerts = await fallAnlegen();
    const hoch1 = await seiteAnlegen(caseIdVorwaerts, "hoch.jpg", jpeg());
    const quer1 = await seiteAnlegen(caseIdVorwaerts, "quer.jpg", jpegQuer());
    const vorwaerts = await fuegeZusammen({
      caseId: caseIdVorwaerts,
      organizationId: orgId,
      documentIds: [hoch1.id, quer1.id],
      titel: "Vorwaerts",
    });
    expect(vorwaerts.ok).toBe(true);
    const vorwaertsDokument = await prisma.document.findUnique({ where: { id: vorwaerts.documentId } });
    const vorwaertsPdf = await PDFDocument.load(await storage.get(vorwaertsDokument.storageKey));
    const [seite1, seite2] = vorwaertsPdf.getPages() as [any, any];
    // hoch.jpg zuerst -> Seite 1 im Hochformat, quer.jpg danach -> Seite 2 im Querformat.
    expect(seite1.getWidth()).toBe(595);
    expect(seite1.getHeight()).toBe(842);
    expect(seite2.getWidth()).toBe(842);
    expect(seite2.getHeight()).toBe(595);

    const caseIdRueckwaerts = await fallAnlegen();
    const hoch2 = await seiteAnlegen(caseIdRueckwaerts, "hoch.jpg", jpeg());
    const quer2 = await seiteAnlegen(caseIdRueckwaerts, "quer.jpg", jpegQuer());
    const rueckwaerts = await fuegeZusammen({
      caseId: caseIdRueckwaerts,
      organizationId: orgId,
      documentIds: [quer2.id, hoch2.id],
      titel: "Rueckwaerts",
    });
    expect(rueckwaerts.ok).toBe(true);
    const rueckwaertsDokument = await prisma.document.findUnique({ where: { id: rueckwaerts.documentId } });
    const rueckwaertsPdf = await PDFDocument.load(await storage.get(rueckwaertsDokument.storageKey));
    const [rSeite1, rSeite2] = rueckwaertsPdf.getPages() as [any, any];
    // Vertauschte Eingabe -> vertauschte Geometrie, sonst haette die
    // Reihenfolge keine erkennbare Wirkung.
    expect(rSeite1.getWidth()).toBe(842);
    expect(rSeite1.getHeight()).toBe(595);
    expect(rSeite2.getWidth()).toBe(595);
    expect(rSeite2.getHeight()).toBe(842);
  });
});
