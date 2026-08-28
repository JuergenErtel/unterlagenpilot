import { after } from "next/server";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { analysiereDokument } from "@/lib/documents/pipeline";
import { aiService } from "@/lib/ai";
import { SEITEN_MUSTER } from "@/lib/detektiv/completeness";
import { pruefeSegmente } from "./pruefung";
import { MIN_SEITEN_FUER_PRUEFUNG, type SegmentVorschlag } from "./types";

/** Steht auf dieser Seite ein Seitenzaehler, der NEU beginnt ("Seite 1 von 3")? */
function beginntNeu(text: string): boolean {
  for (const muster of SEITEN_MUSTER) {
    muster.lastIndex = 0;
    const treffer = muster.exec(text);
    if (treffer && /\b1\s*(?:von|\/)/i.test(treffer[0])) return true;
  }
  return false;
}

/**
 * Erkennt, ob eine Datei mehrere Dokumente enthaelt, und legt den Vorschlag ab.
 *
 * Wirft nie: ein Fehlschlag darf weder OCR noch Extraktion noch den Detektiv
 * mitreissen. Sichtbar wird er ueber splitStatus – "nicht geprueft" und
 * "nichts gefunden" duerfen nie gleich aussehen.
 */
export async function erkenneAufteilung(documentId: string): Promise<void> {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        mimeType: true,
        pageCount: true,
        ocrStatus: true,
        pages: { select: { pageNumber: true, ocrText: true }, orderBy: { pageNumber: "asc" } },
        // Ist dieses Dokument selbst aus Einzelseiten entstanden?
        _count: { select: { quellseiten: true } },
      },
    });
    if (!doc) return;

    const seitenzahl = doc.pageCount ?? doc.pages.length;
    const pruefbar =
      doc.mimeType === "application/pdf" &&
      seitenzahl >= MIN_SEITEN_FUER_PRUEFUNG &&
      doc.ocrStatus === "fertig" &&
      doc.pages.length > 0 &&
      // Ein gerade aus Einzelseiten zusammengefuegtes Dokument nicht sofort
      // wieder zum Zerlegen vorschlagen - der Vermittler hat eben entschieden,
      // dass diese Seiten zusammengehoeren.
      doc._count.quellseiten === 0;

    if (!pruefbar) {
      // Geprueft und nichts zu tun – das ist kein Fehler.
      await prisma.document.update({ where: { id: documentId }, data: { splitStatus: "fertig" } });
      return;
    }

    await prisma.document.update({ where: { id: documentId }, data: { splitStatus: "laeuft" } });

    const seiten = doc.pages.map((p) => ({
      pageNumber: p.pageNumber,
      anfang: (p.ocrText ?? "").trim().slice(0, 300),
      beginntNeu: beginntNeu(p.ocrText ?? ""),
    }));

    const antwort = await aiService.erkenneDokumentgrenzen(seiten);
    const segmente = antwort.segmente as SegmentVorschlag[];
    const pruefung = pruefeSegmente(segmente, seitenzahl);

    await prisma.$transaction([
      // Ein erneuter Lauf ersetzt den alten Vorschlag, statt ihn zu verdoppeln.
      prisma.documentSplitSegment.deleteMany({ where: { documentId } }),
      ...(pruefung.ok
        ? [
            prisma.documentSplitSegment.createMany({
              data: [...segmente]
                .sort((a, b) => a.vonSeite - b.vonSeite)
                .map((s, i) => ({
                  documentId,
                  reihenfolge: i,
                  vonSeite: s.vonSeite,
                  bisSeite: s.bisSeite,
                  vermuteterTyp: s.vermuteterTyp,
                  titel: s.titel,
                  confidence: s.confidence,
                })),
            }),
          ]
        : []),
      prisma.document.update({ where: { id: documentId }, data: { splitStatus: "fertig" } }),
    ]);
  } catch (e) {
    console.error(`[aufteilung] Erkennung fuer Dokument ${documentId} fehlgeschlagen:`, e);
    await prisma.document
      .update({ where: { id: documentId }, data: { splitStatus: "fehler" } })
      .catch(() => undefined);
  }
}

/**
 * Trennt eine Sammeldatei entlang des freigegebenen Vorschlags auf.
 *
 * Alles oder nichts: Erst werden ALLE Teildateien gespeichert, dann erst
 * entstehen die Datensaetze. Ein halb aufgetrenntes PDF waere schlimmer als gar
 * keines – drei von acht Dokumenten und ein Original, das aussieht, als sei es
 * erledigt.
 */
export async function teileAuf(
  documentId: string,
  organizationId: string
): Promise<{ ok: true; anzahl: number } | { ok: false; grund: string }> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, case: { organizationId } },
    include: { splitSegmente: { orderBy: { reihenfolge: "asc" } } },
  });
  if (!doc) return { ok: false, grund: "Dokument nicht gefunden." };
  if (doc.splitSegmente.length < 2) {
    return { ok: false, grund: "Für dieses Dokument liegt kein Aufteilungsvorschlag vor." };
  }

  const storage = getStorage();
  const original = await storage.get(doc.storageKey);
  if (!original) return { ok: false, grund: "Die Datei ist im Speicher nicht auffindbar." };

  const { PDFDocument } = await import("pdf-lib");
  const abgelegt: Array<{
    storageKey: string;
    sizeBytes: number;
    name: string;
    seiten: number;
    segment: (typeof doc.splitSegmente)[number];
  }> = [];

  try {
    const quelle = await PDFDocument.load(original);
    for (const s of doc.splitSegmente) {
      const ziel = await PDFDocument.create();
      const indizes = Array.from(
        { length: s.bisSeite - s.vonSeite + 1 },
        (_, i) => s.vonSeite - 1 + i
      );
      const seiten = await ziel.copyPages(quelle, indizes);
      for (const p of seiten) ziel.addPage(p);
      const bytes = Buffer.from(await ziel.save());

      const name = `${s.reihenfolge + 1}_${s.titel.replace(/[^A-Za-z0-9äöüÄÖÜß._-]+/g, "_")}.pdf`;
      const gespeichert = await storage.put({
        organizationId,
        caseId: doc.caseId,
        originalName: name,
        mimeType: "application/pdf",
        buffer: bytes,
      });
      abgelegt.push({
        storageKey: gespeichert.storageKey,
        sizeBytes: bytes.byteLength,
        name,
        seiten: indizes.length,
        segment: s,
      });
    }
  } catch (e) {
    // Bereits abgelegte Teildateien wieder entfernen – kein Muell im Speicher,
    // und der Fall bleibt exakt so, wie er war.
    for (const a of abgelegt) await storage.remove(a.storageKey).catch(() => undefined);
    console.error(`[aufteilung] Auftrennen von ${documentId} fehlgeschlagen:`, e);
    return { ok: false, grund: "Die Datei konnte nicht aufgetrennt werden." };
  }

  const kinder = await prisma.$transaction(async (tx) => {
    const erzeugt = [];
    for (const a of abgelegt) {
      erzeugt.push(
        await tx.document.create({
          data: {
            caseId: doc.caseId,
            applicantId: doc.applicantId,
            aufgeteiltAusId: doc.id,
            originalName: a.name,
            storageKey: a.storageKey,
            mimeType: "application/pdf",
            sizeBytes: a.sizeBytes,
            pageCount: a.seiten,
            uploadSource: doc.uploadSource,
            // Dieselben Bytes wurden bereits geprueft – kein zweiter Virenscan.
            scanStatus: doc.scanStatus,
            scanEngine: doc.scanEngine,
            scannedAt: doc.scannedAt,
            documentType: a.segment.vermuteterTyp,
            // Ein Teildokument wird nicht erneut auf Aufteilung untersucht.
            splitStatus: "fertig",
          },
        })
      );
    }
    await tx.documentSplitSegment.deleteMany({ where: { documentId: doc.id } });
    await tx.document.update({ where: { id: doc.id }, data: { reviewStatus: "ersetzt" } });
    return erzeugt;
  });

  // Analyse der Teildokumente im Hintergrund – der Klick soll nicht warten.
  // Die Aufteilung ist an dieser Stelle bereits festgeschrieben: scheitert nur
  // die Einplanung, darf das den Erfolg nicht kippen. Die Teile lassen sich
  // ueber "KI-Pruefung starten" jederzeit nachanalysieren.
  try {
    after(async () => {
      for (const k of kinder) await analysiereDokument(k.id);
    });
  } catch (e) {
    console.error(`[aufteilung] Analyse der Teildokumente konnte nicht eingeplant werden:`, e);
  }

  return { ok: true, anzahl: kinder.length };
}
