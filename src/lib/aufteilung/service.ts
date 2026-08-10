import { prisma } from "@/lib/db";
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
      },
    });
    if (!doc) return;

    const seitenzahl = doc.pageCount ?? doc.pages.length;
    const pruefbar =
      doc.mimeType === "application/pdf" &&
      seitenzahl >= MIN_SEITEN_FUER_PRUEFUNG &&
      doc.ocrStatus === "fertig" &&
      doc.pages.length > 0;

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
