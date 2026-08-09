import { prisma } from "@/lib/db";
import { aiService } from "@/lib/ai";
import type { DocumentType, Severity } from "@/lib/domain/enums";
import { candidatePages } from "./pages";
import { followUpsFor } from "./rules";
import { matchReference } from "./match";
import { seitenBefund, aktualitaetsBefund } from "./completeness";
import { fingerprint } from "./fingerprint";
import type { DocReference, FindingCode, Resolution, SelbstAuskunft } from "./types";

const ISO = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Stufe 1 – teuer, laeuft einmal je Dokument. Liest die Verweise aus den
 * Kandidatenseiten und legt sie als DocumentReference ab.
 *
 * Wirft nie: ein Fehlschlag darf weder OCR noch Feld-Extraktion mitreissen.
 * Er wird als referenceStatus = "fehler" sichtbar – "nichts gefunden" und
 * "nicht geprueft" duerfen im UI nie gleich aussehen.
 */
export async function runReferenceExtraction(documentId: string): Promise<void> {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        caseId: true,
        documentType: true,
        pages: { select: { pageNumber: true, ocrText: true }, orderBy: { pageNumber: "asc" } },
      },
    });
    if (!doc) return;

    await prisma.document.update({ where: { id: documentId }, data: { referenceStatus: "laeuft" } });

    const kandidaten = candidatePages(
      doc.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.ocrText }))
    );
    const ergebnis = await aiService.extractDocumentReferences(doc.documentType, kandidaten);

    await prisma.$transaction([
      prisma.documentReference.deleteMany({ where: { documentId } }),
      prisma.documentReference.createMany({
        data: ergebnis.references.map((r) => ({
          documentId,
          caseId: doc.caseId,
          kind: r.kind,
          label: r.label,
          urkundeDatum: r.urkundeDatum ? new Date(r.urkundeDatum) : null,
          urkundenNummer: r.urkundenNummer,
          notar: r.notar,
          abteilung: r.abteilung,
          laufendeNummer: r.laufendeNummer,
          sourcePage: r.sourcePage,
          sourceQuote: r.sourceQuote,
          confidence: r.confidence,
        })),
      }),
      prisma.document.update({ where: { id: documentId }, data: { referenceStatus: "fertig" } }),
    ]);
  } catch (e) {
    console.error(`[detektiv] Verweislauf fuer Dokument ${documentId} fehlgeschlagen:`, e);
    await prisma.document
      .update({ where: { id: documentId }, data: { referenceStatus: "fehler" } })
      .catch(() => undefined);
  }
}

interface Kandidat {
  fingerprint: string;
  caseId: string;
  code: FindingCode;
  title: string;
  reason: string;
  severity: Severity;
  resolution: Resolution;
  suggestedDocumentType: DocumentType | null;
  sourceDocumentId: string;
  sourcePage: number | null;
  sourceQuote: string | null;
  referenceId: string | null;
  matchCandidateId: string | null;
  status: "offen" | "unsicher";
}

/**
 * Stufe 2 – billig und deterministisch, laeuft bei jeder Aenderung am Fall.
 * Nur so schliesst sich ein Befund von selbst, wenn die Urkunde spaeter kommt.
 */
export async function reconcileCase(
  caseId: string,
  jetzt: Date = new Date()
): Promise<{ angelegt: number; erledigt: number }> {
  const dokumente = await prisma.document.findMany({
    where: { caseId },
    select: {
      id: true,
      documentType: true,
      pageCount: true,
      createdAt: true,
      pages: { select: { pageNumber: true, ocrText: true }, orderBy: { pageNumber: "asc" } },
      references: true,
    },
  });

  // Eigenauskuenfte aller Dokumente – die Gegenseite des Abgleichs.
  const vorhanden: SelbstAuskunft[] = dokumente.flatMap((d) =>
    d.references
      .filter((r) => r.kind === "selbst")
      .map((r) => ({
        documentId: d.id,
        documentType: d.documentType,
        label: r.label,
        urkundeDatum: ISO(r.urkundeDatum),
        urkundenNummer: r.urkundenNummer,
      }))
  );

  const kandidaten: Kandidat[] = [];

  for (const d of dokumente) {
    const docType = d.documentType as DocumentType | null;

    // a) Verweise → Folgeregeln → Abgleich
    for (const rRow of d.references) {
      if (rRow.kind === "selbst") continue;

      const ref: DocReference = {
        kind: rRow.kind as DocReference["kind"],
        label: rRow.label,
        urkundeDatum: ISO(rRow.urkundeDatum),
        urkundenNummer: rRow.urkundenNummer,
        notar: rRow.notar,
        abteilung: rRow.abteilung as DocReference["abteilung"],
        laufendeNummer: rRow.laufendeNummer,
        sourcePage: rRow.sourcePage,
        sourceQuote: rRow.sourceQuote,
        confidence: rRow.confidence ?? 0,
      };

      const treffer = matchReference(ref, vorhanden);
      if (treffer.kind === "sicher") continue; // liegt vor – kein Befund

      for (const f of followUpsFor(ref, docType)) {
        if (f.hinweisOnly) continue; // Hinweise erzeugen keine Nachforderung
        kandidaten.push({
          fingerprint: fingerprint({ sourceDocumentId: d.id, code: f.code, refKey: f.refKey }),
          caseId,
          code: f.code,
          title: f.title,
          reason: f.reason,
          severity: f.severity,
          resolution: f.resolution,
          suggestedDocumentType: f.documentType,
          sourceDocumentId: d.id,
          sourcePage: ref.sourcePage,
          sourceQuote: ref.sourceQuote,
          referenceId: rRow.id,
          matchCandidateId: treffer.kind === "unsicher" ? treffer.documentId : null,
          status: treffer.kind === "unsicher" ? "unsicher" : "offen",
        });
      }
    }

    // b) Vollstaendigkeit des Dokuments selbst
    const seiten = seitenBefund(
      d.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.ocrText })),
      d.pageCount
    );
    const alter = aktualitaetsBefund(docType, d.createdAt, jetzt);
    for (const b of [seiten, alter]) {
      if (!b) continue;
      kandidaten.push({
        fingerprint: fingerprint({ sourceDocumentId: d.id, code: b.code, refKey: b.refKey }),
        caseId,
        code: b.code,
        title: b.title,
        reason: b.reason,
        severity: "warnung",
        resolution: b.resolution,
        suggestedDocumentType: docType,
        sourceDocumentId: d.id,
        sourcePage: null,
        sourceQuote: null,
        referenceId: null,
        matchCandidateId: null,
        status: "offen",
      });
    }
  }

  const bestand = await prisma.caseFinding.findMany({ where: { caseId } });
  const bekannt = new Set(bestand.map((f) => f.fingerprint));

  let angelegt = 0;
  for (const k of kandidaten) {
    // Schon bekannt? Dann bleibt die Entscheidung des Vermittlers stehen –
    // ein erneuter Lauf darf Verworfenes nicht zurueckholen.
    if (bekannt.has(k.fingerprint)) continue;
    bekannt.add(k.fingerprint);
    await prisma.caseFinding.create({ data: k });
    angelegt++;
  }

  // Was nicht mehr Kandidat ist, ist erledigt – die Urkunde ist aufgetaucht.
  const aktuell = new Set(kandidaten.map((k) => k.fingerprint));
  const zuErledigen = bestand.filter(
    (f) => (f.status === "offen" || f.status === "unsicher") && !aktuell.has(f.fingerprint)
  );
  if (zuErledigen.length > 0) {
    await prisma.caseFinding.updateMany({
      where: { id: { in: zuErledigen.map((f) => f.id) } },
      data: { status: "erledigt" },
    });
  }

  // Zuletzt: wurde die freigegebene Checklistenposition wieder geloescht, ist
  // die Luecke erneut offen. Muss NACH der Erledigung laufen, sonst wuerde der
  // Sweep den gerade wieder geoeffneten Befund im selben Lauf zumachen.
  const freigegebene = bestand.filter((f) => f.status === "freigegeben" && f.checklistItemId);
  if (freigegebene.length > 0) {
    const nochDa = new Set(
      (
        await prisma.caseChecklistItem.findMany({
          where: { id: { in: freigegebene.map((f) => f.checklistItemId as string) } },
          select: { id: true },
        })
      ).map((i) => i.id)
    );
    const verwaist = freigegebene.filter((f) => !nochDa.has(f.checklistItemId as string));
    if (verwaist.length > 0) {
      await prisma.caseFinding.updateMany({
        where: { id: { in: verwaist.map((f) => f.id) } },
        data: { status: "offen", checklistItemId: null },
      });
    }
  }

  return { angelegt, erledigt: zuErledigen.length };
}
