import { prisma } from "@/lib/db";
import { aiService } from "@/lib/ai";
import { SEITEN_MUSTER } from "@/lib/detektiv/completeness";
import { countProcessingDocuments } from "@/lib/documents/processing";
import { waehleKandidaten, type Kandidat } from "./kandidaten";
import { pruefeBuendel } from "./pruefung";
import { TEXT_ANFANG, type BuendelVorschlag } from "./types";
import type { DocumentType } from "@/lib/domain/enums";

/** Nach dieser Zeit gilt ein `laeuft` als haengengeblieben (Absturz, Deploy). */
const SPERRE_VERFAELLT_MS = 10 * 60_000;

/** Steht auf dieser Seite ueberhaupt ein Seitenzaehler ("Seite 2 von 4")? */
function hatSeitenzaehler(text: string): boolean {
  for (const muster of SEITEN_MUSTER) {
    muster.lastIndex = 0;
    if (muster.test(text)) return true;
  }
  return false;
}

/**
 * Prueft den GANZEN Fall darauf, welche Einzelseiten zu einem Dokument
 * gehoeren, und legt die Vorschlaege ab.
 *
 * Fallweit und nicht je Datei: Ein einzelnes Foto sagt nichts darueber, ob es
 * zu einem anderen gehoert - die Frage ist erst beantwortbar, wenn alle Seiten
 * da sind.
 *
 * Wirft nie: ein Fehlschlag darf weder OCR noch Extraktion noch den Detektiv
 * mitreissen. Sichtbar wird er ueber `Case.buendelStatus` - "nicht geprueft"
 * und "nichts gefunden" duerfen nie gleich aussehen.
 */
export async function erkenneBuendel(caseId: string): Promise<void> {
  // Merkt sich, ob WIR die Sperre bekommen haben. Scheitert schon das Setzen
  // der Sperre (z. B. Verbindungsfehler), gehoert der Lauf uns nie - dann darf
  // der catch-Block unten nicht "fehler" hineinschreiben und damit einen
  // fremden, echten Lauf ueberschreiben.
  let sperreErhalten = false;

  try {
    // Die Sperre liegt in der Datenbank, nicht im Speicher: zwei gleichzeitig
    // fertig gewordene Dokumente wuerden sonst beide "niemand laeuft mehr" sehen
    // und beide die KI rufen.
    const beansprucht = await prisma.case.updateMany({
      where: {
        id: caseId,
        OR: [
          { buendelStatus: { not: "laeuft" } },
          { buendelStatusAm: { lt: new Date(Date.now() - SPERRE_VERFAELLT_MS) } },
        ],
      },
      data: { buendelStatus: "laeuft", buendelStatusAm: new Date() },
    });
    // Verloren - der Nachbar laeuft schon (oder der Fall existiert nicht). Ein
    // stiller Rueckzug, kein Fehler.
    if (beansprucht.count !== 1) return;
    sperreErhalten = true;

    const docs = await prisma.document.findMany({
      where: { caseId },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        pageCount: true,
        reviewStatus: true,
        ocrStatus: true,
        readable: true,
        zusammengefuegtInId: true,
        documentType: true,
        period: true,
        createdAt: true,
        pages: { select: { ocrText: true }, orderBy: { pageNumber: "asc" }, take: 1 },
      },
    });

    const kandidaten: Kandidat[] = waehleKandidaten(
      docs.map((d) => ({
        id: d.id,
        originalName: d.originalName,
        mimeType: d.mimeType,
        pageCount: d.pageCount,
        reviewStatus: d.reviewStatus,
        ocrStatus: d.ocrStatus,
        readable: d.readable,
        zusammengefuegtInId: d.zusammengefuegtInId,
        documentType: d.documentType as DocumentType | null,
        period: d.period,
        createdAt: d.createdAt,
        text: (d.pages[0]?.ocrText ?? "").trim(),
      }))
    );

    if (kandidaten.length === 0) {
      // Geprueft und nichts zu tun - das ist kein Fehler.
      await abschliessen(caseId, "fertig", []);
      return;
    }

    const antwort = await aiService.gruppiereEinzelseiten(
      kandidaten.map((k, i) => ({
        nummer: i,
        dateiname: k.originalName,
        hochgeladen: k.createdAt.toISOString(),
        erkannterTyp: k.documentType,
        zeitraum: k.period,
        seitenzaehler: hatSeitenzaehler(k.text),
        anfang: k.text.slice(0, TEXT_ANFANG),
      }))
    );

    const { angenommen, verworfen } = pruefeBuendel(antwort.buendel as BuendelVorschlag[], kandidaten);
    for (const v of verworfen) {
      // Ohne Klartext-Inhalte: nur, welcher Vorschlag warum wegfiel.
      console.info(`[buendelung] Vorschlag „${v.titel}“ verworfen: ${v.grund}`);
    }

    await abschliessen(
      caseId,
      "fertig",
      angenommen.map((b, i) => ({
        reihenfolge: i,
        titel: b.titel,
        vermuteterTyp: b.vermuteterTyp,
        confidence: b.confidence,
        seiten: b.seiten.map((nummer, position) => ({ documentId: kandidaten[nummer]!.id, position })),
      }))
    );
  } catch (e) {
    console.error(`[buendelung] Erkennung fuer Fall ${caseId} fehlgeschlagen:`, e);
    if (!sperreErhalten) {
      // Die Sperre selbst ist gescheitert - wir waren nie der Besitzer dieses
      // Laufs. Der ehrliche Zustand ist: unveraendert. "fehler" zu schreiben
      // wuerde blind behaupten, WIR haetten etwas geprueft und wuerde im
      // schlimmsten Fall den echten, gerade laufenden oder bereits fertigen
      // Stand eines anderen Aufrufs ueberschreiben.
      return;
    }
    await prisma.case
      .update({ where: { id: caseId }, data: { buendelStatus: "fehler", buendelStatusAm: new Date() } })
      .catch(() => undefined);
  }
}

interface NeuesBuendel {
  reihenfolge: number;
  titel: string;
  vermuteterTyp: DocumentType | null;
  confidence: number;
  seiten: Array<{ documentId: string; position: number }>;
}

/**
 * Setzt Status und Vorschlaege in EINER Transaktion. Ein erneuter Lauf ersetzt
 * den alten Vorschlag, statt ihn zu verdoppeln.
 */
async function abschliessen(caseId: string, status: "fertig", buendel: NeuesBuendel[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.documentBuendel.deleteMany({ where: { caseId } });
    for (const b of buendel) {
      await tx.documentBuendel.create({
        data: {
          caseId,
          reihenfolge: b.reihenfolge,
          titel: b.titel,
          vermuteterTyp: b.vermuteterTyp ?? undefined,
          confidence: b.confidence,
          seiten: { create: b.seiten },
        },
      });
    }
    await tx.case.update({
      where: { id: caseId },
      data: { buendelStatus: status, buendelStatusAm: new Date() },
    });
  });
}

/**
 * "Wer als Letzter fertig wird, macht das Licht aus."
 *
 * Am Ende der Analyse eines Dokuments: laeuft im Fall noch eine andere
 * Analyse? Wenn nein, startet dieses Dokument den fallweiten Buendel-Lauf.
 * Ergebnis ist EIN KI-Aufruf je Upload-Schwung, gleich ob drei oder dreissig
 * Seiten - dreissig Aufrufe wuerden das Mistral-Kontingent (50/Minute)
 * sprengen.
 *
 * Das eigene Dokument wird ausgenommen: sein Status steht zu diesem Zeitpunkt
 * je nach Reihenfolge der Schreibvorgaenge moeglicherweise noch auf "laeuft",
 * und es duerfte sich nicht selbst blockieren.
 *
 * Ein Nachbar zaehlt nur mit, wenn sein "laeuft" noch FRISCH ist
 * (`countProcessingDocuments`, dieselbe Alters-Schwelle wie beim Poll-Status
 * der Fallseite). Stirbt ein Hintergrundlauf hart (Deploy, Function-Timeout),
 * gibt es keinen Aufraeum-Cron, der die Zeile zuruecksetzt - ohne diese
 * Bereinigung wuerde ein einziges tot haengengebliebenes Nachbardokument den
 * Buendel-Lauf fuer den ganzen restlichen Fall fuer immer verhindern.
 *
 * Wirft nie.
 */
export async function starteBuendelLaufWennFertig(caseId: string, eigeneDocumentId: string): Promise<void> {
  try {
    const kandidaten = await prisma.document.findMany({
      where: {
        caseId,
        id: { not: eigeneDocumentId },
        OR: [
          { ocrStatus: "laeuft" },
          { classificationStatus: "laeuft" },
          { extractionStatus: "laeuft" },
        ],
      },
      select: { ocrStatus: true, classificationStatus: true, extractionStatus: true, updatedAt: true },
    });
    if (countProcessingDocuments(kandidaten) > 0) return;
    await erkenneBuendel(caseId);
  } catch (e) {
    console.error(`[buendelung] Anstoss fuer Fall ${caseId} fehlgeschlagen:`, e);
  }
}
