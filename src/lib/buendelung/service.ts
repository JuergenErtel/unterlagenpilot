import { after } from "next/server";
import { prisma } from "@/lib/db";
import { aiService } from "@/lib/ai";
import { getStorage } from "@/lib/storage";
import { analysiereDokument } from "@/lib/documents/pipeline";
import { SEITEN_MUSTER } from "@/lib/detektiv/completeness";
import { countProcessingDocuments } from "@/lib/documents/processing";
import { waehleKandidaten, istBuendelKandidat, type Kandidat } from "./kandidaten";
import { baueBuendelPdf } from "./pdf";
import { pruefeBuendel } from "./pruefung";
import { MIN_KANDIDATEN, TEXT_ANFANG, type BuendelVorschlag } from "./types";
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

export interface ZusammenfuegenInput {
  caseId: string;
  organizationId: string;
  /** Die Quellseiten IN DER GEWUENSCHTEN SEITENREIHENFOLGE. */
  documentIds: string[];
  titel: string;
  vermuteterTyp?: DocumentType | null;
  /** Der Vorschlag, aus dem das kam - er wird danach entfernt. */
  buendelId?: string;
}

export type ZusammenfuegenErgebnis =
  | { ok: true; documentId: string; seiten: number }
  | { ok: false; grund: string };

/**
 * Fuegt Einzelseiten zu EINEM PDF zusammen - nur auf Klick.
 *
 * Alles oder nichts: Erst wird die fertige Datei abgelegt, dann erst entstehen
 * die Datensaetze. Ein halb zusammengefuegtes Dokument waere schlimmer als gar
 * keines - dieselbe Regel wie beim Auftrennen.
 *
 * Dieselbe Funktion bedient den KI-Vorschlag und die Auswahl von Hand. Zwei
 * Pfade wuerden auseinanderlaufen.
 */
export async function fuegeZusammen(input: ZusammenfuegenInput): Promise<ZusammenfuegenErgebnis> {
  const { caseId, organizationId, documentIds, titel } = input;
  if (documentIds.length < MIN_KANDIDATEN) {
    return { ok: false, grund: "Zum Zusammenfügen braucht es mindestens zwei Seiten." };
  }

  const docs = await prisma.document.findMany({
    where: { id: { in: documentIds }, caseId, case: { organizationId } },
    select: {
      id: true,
      originalName: true,
      storageKey: true,
      mimeType: true,
      pageCount: true,
      applicantId: true,
      uploadSource: true,
      scanStatus: true,
      scanEngine: true,
      scannedAt: true,
      reviewStatus: true,
      ocrStatus: true,
      readable: true,
      zusammengefuegtInId: true,
      documentType: true,
      period: true,
      createdAt: true,
    },
  });
  if (docs.length !== documentIds.length) {
    return { ok: false, grund: "Mindestens eine Seite gehört nicht zu diesem Fall." };
  }

  // Diese Funktion ist ueber eine Server Action mit einer kommagetrennten
  // ID-Liste aus einem Formular erreichbar - dort kann JEDE Dokument-ID des
  // Falls landen, auch ein 40-seitiges PDF oder ein bereits freigegebenes
  // Dokument. istBuendelKandidat ist die EINE Stelle, an der diese Regel
  // steht (dieselbe, die die Auswahlkaestchen in der Fallakte und den
  // KI-Lauf bindet) - sie hier zu wiederholen waere genau die Falle, gegen
  // die der Export in kandidaten.ts geschaffen wurde. Die Pruefung laeuft
  // VOR jedem Storage-Zugriff, damit ein Ablehnen nie etwas anfasst.
  const kandidaten: Kandidat[] = docs.map((d) => ({
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
    // istBuendelKandidat sieht nur Struktur-Felder - der Text ist fuer die
    // Regel ohne Bedeutung, ein Nachladen aus DocumentPage waere hier
    // verschwendet.
    text: "",
  }));
  const ungueltig = kandidaten.find((k) => !istBuendelKandidat(k));
  if (ungueltig) {
    return {
      ok: false,
      grund: `„${ungueltig.originalName}“ ist keine bündelbare Einzelseite mehr (mehrseitiges Dokument, bereits freigegeben oder schon gebündelt).`,
    };
  }

  // In die vom Aufrufer gewuenschte Reihenfolge bringen - findMany liefert sie
  // in beliebiger Ordnung, und die Reihenfolge IST hier die Aussage.
  const nachId = new Map(docs.map((d) => [d.id, d]));
  const geordnet = documentIds.map((id) => nachId.get(id)!);

  const storage = getStorage();
  const teile: Array<{ mimeType: string; buffer: Buffer }> = [];
  for (const [i, d] of geordnet.entries()) {
    const buffer = await storage.get(d.storageKey);
    if (!buffer) return { ok: false, grund: `Seite ${i + 1} ist im Speicher nicht auffindbar.` };
    teile.push({ mimeType: d.mimeType, buffer });
  }

  let pdf: Buffer;
  try {
    pdf = await baueBuendelPdf(teile);
  } catch (e) {
    console.error(`[buendelung] PDF fuer Fall ${caseId} nicht baubar:`, e);
    return { ok: false, grund: e instanceof Error ? e.message : "Die Seiten ließen sich nicht zusammenfügen." };
  }

  const name = `${titel.replace(/[^A-Za-z0-9äöüÄÖÜß._-]+/g, "_")}.pdf`;
  let gespeichert;
  try {
    gespeichert = await storage.put({
      organizationId,
      caseId,
      originalName: name,
      mimeType: "application/pdf",
      buffer: pdf,
    });
  } catch (e) {
    console.error(`[buendelung] Ablegen des PDFs fuer Fall ${caseId} fehlgeschlagen:`, e);
    return { ok: false, grund: "Das zusammengefügte Dokument konnte nicht gespeichert werden." };
  }

  const erste = geordnet[0]!;
  try {
    const neu = await prisma.$transaction(async (tx) => {
      const erzeugt = await tx.document.create({
        data: {
          caseId,
          applicantId: erste.applicantId,
          originalName: name,
          storageKey: gespeichert.storageKey,
          mimeType: "application/pdf",
          sizeBytes: pdf.byteLength,
          pageCount: teile.length,
          uploadSource: erste.uploadSource,
          // Dieselben Bytes wurden bereits geprueft - kein zweiter Virenscan.
          scanStatus: erste.scanStatus,
          scanEngine: erste.scanEngine,
          scannedAt: erste.scannedAt,
          documentType: input.vermuteterTyp ?? undefined,
          // Ein gebuendeltes Dokument wird nicht auf Aufteilung untersucht.
          splitStatus: "fertig",
        },
      });
      await tx.document.updateMany({
        where: { id: { in: documentIds } },
        data: { zusammengefuegtInId: erzeugt.id, reviewStatus: "ersetzt" },
      });
      if (input.buendelId) {
        await tx.documentBuendel.deleteMany({ where: { id: input.buendelId, caseId } });
      }
      return erzeugt;
    });

    // Analyse im Hintergrund - der Klick soll nicht warten. Die Buendelung ist
    // an dieser Stelle festgeschrieben: scheitert nur die Einplanung, darf das
    // den Erfolg nicht kippen.
    try {
      after(() => analysiereDokument(neu.id));
    } catch (e) {
      console.error(`[buendelung] Analyse von ${neu.id} konnte nicht eingeplant werden:`, e);
    }

    return { ok: true, documentId: neu.id, seiten: teile.length };
  } catch (e) {
    // Kein Muell im Speicher, und der Fall bleibt exakt so, wie er war.
    await storage.remove(gespeichert.storageKey).catch(() => undefined);
    console.error(`[buendelung] Zusammenfuegen im Fall ${caseId} fehlgeschlagen:`, e);
    return { ok: false, grund: "Das Zusammenfügen ist fehlgeschlagen." };
  }
}
