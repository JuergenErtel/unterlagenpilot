import { prisma } from "@/lib/db";
import type { DocumentType } from "@/lib/domain/enums";
import type { Unterlagenanforderung } from "@/lib/platforms/europace/types";
import { antragstellerFuer, bezeichnungFuer, dokumenttypFuer } from "./zuordnung";

export interface AbrufEingabe {
  caseId: string;
  quelle: "antrag" | "vorschlag";
  vorgangsNummer: string;
  bezugsId: string;
  bankId: string | null;
  bankName: string;
  anforderungen: Unterlagenanforderung[];
}

export interface AktiverAbruf {
  id: string;
  bankId: string | null;
  bankName: string;
  quelle: string;
  bezugsId: string;
  abgerufenAm: Date;
  anforderungen: Array<{
    id: string;
    bezeichnung: string;
    documentType: DocumentType | null;
    liegtVor: boolean;
    ausgeblendet: boolean;
    code: string;
    bezugName: string | null;
    applicantId: string | null;
  }>;
}

/**
 * Schreibt einen Abruf und macht ihn zum aktiven.
 *
 * Bankwechsel loescht nichts: Der Abruf fuer die alte Bank bleibt als Verlauf
 * liegen und verliert nur das Kennzeichen. Was der Kunde fuer Bank A geschickt
 * hat, soll nicht verschwinden, weil der Fall zu Bank B wandert.
 *
 * Dokumenttyp und Antragsteller werden HIER aufgeloest, nicht bei der Anzeige –
 * einmal sauber ablegen statt bei jedem Aufruf neu rechnen.
 */
export async function speichereAbruf(
  e: AbrufEingabe,
  jetzt: Date = new Date()
): Promise<{ abrufId: string; zeilen: number }> {
  const applicants = await prisma.applicant.findMany({
    where: { caseId: e.caseId },
    select: { id: true, position: true, vorname: true, nachname: true },
    orderBy: { position: "asc" },
  });

  return prisma.$transaction(async (tx) => {
    const abruf = await tx.bankAnforderungsAbruf.upsert({
      where: {
        caseId_quelle_bezugsId: {
          caseId: e.caseId,
          quelle: e.quelle,
          bezugsId: e.bezugsId,
        },
      },
      create: {
        caseId: e.caseId,
        quelle: e.quelle,
        bezugsId: e.bezugsId,
        vorgangsNummer: e.vorgangsNummer,
        bankId: e.bankId,
        bankName: e.bankName,
        abgerufenAm: jetzt,
        aktiv: true,
      },
      update: {
        vorgangsNummer: e.vorgangsNummer,
        bankId: e.bankId,
        bankName: e.bankName,
        abgerufenAm: jetzt,
        aktiv: true,
      },
    });

    // Genau ein Abruf je Fall ist aktiv.
    await tx.bankAnforderungsAbruf.updateMany({
      where: { caseId: e.caseId, id: { not: abruf.id } },
      data: { aktiv: false },
    });

    const behalten: string[] = [];
    for (const a of e.anforderungen) {
      const werte = {
        code: a.code ?? "",
        text: a.text ?? "",
        kurzbezeichnung: a.kurzbezeichnung ?? "",
        erfuellungskategorien: a.erfuellungskategorien ?? [],
        bezugTyp: a.bezug?.typ ?? null,
        bezugName: a.bezug?.name ?? null,
        bezugRolle: a.bezug?.rolle?.typ ?? null,
        liegtVor: a.liegtVor ?? false,
        ausgeblendet: a.ausgeblendet ?? false,
        documentType: dokumenttypFuer(a.erfuellungskategorien),
        applicantId: antragstellerFuer(a.bezug, applicants),
      };
      await tx.bankAnforderung.upsert({
        where: { abrufId_externeId: { abrufId: abruf.id, externeId: a.id } },
        create: { abrufId: abruf.id, externeId: a.id, ...werte },
        update: werte,
      });
      behalten.push(a.id);
    }

    // Was die Bank nicht mehr nennt, faellt weg – sonst bliebe eine Anforderung
    // ewig stehen, die zurueckgezogen wurde.
    //
    // Prisma rendert ein leeres notIn als NOT IN (NULL) – das trifft KEINE Zeile.
    // Ohne die Fallunterscheidung ueberlebt eine komplett zurueckgezogene
    // Anforderungsliste stumm in der Datenbank.
    if (behalten.length > 0) {
      await tx.bankAnforderung.deleteMany({
        where: { abrufId: abruf.id, externeId: { notIn: behalten } },
      });
    } else {
      await tx.bankAnforderung.deleteMany({ where: { abrufId: abruf.id } });
    }

    return { abrufId: abruf.id, zeilen: e.anforderungen.length };
  });
}

/** Der aktive Abruf des Falls, aufbereitet fuer Abgleich und Anzeige. */
export async function ladeAktivenAbruf(caseId: string): Promise<AktiverAbruf | null> {
  const abruf = await prisma.bankAnforderungsAbruf.findFirst({
    where: { caseId, aktiv: true },
    include: { anforderungen: { orderBy: { kurzbezeichnung: "asc" } } },
  });
  if (!abruf) return null;

  return {
    id: abruf.id,
    bankId: abruf.bankId,
    bankName: abruf.bankName,
    quelle: abruf.quelle,
    bezugsId: abruf.bezugsId,
    abgerufenAm: abruf.abgerufenAm,
    anforderungen: abruf.anforderungen.map((a) => ({
      id: a.externeId,
      bezeichnung: bezeichnungFuer({
        id: a.externeId,
        code: a.code,
        text: a.text,
        kurzbezeichnung: a.kurzbezeichnung,
      }),
      documentType: a.documentType,
      liegtVor: a.liegtVor,
      ausgeblendet: a.ausgeblendet,
      code: a.code,
      bezugName: a.bezugName,
      applicantId: a.applicantId,
    })),
  };
}
