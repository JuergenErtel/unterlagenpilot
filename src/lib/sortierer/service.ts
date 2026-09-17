import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { nurSortierung } from "@/lib/cases/aktenart";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/domain/enums";

/**
 * Der Unterlagensortierer: Dokumente ordnen, ohne dass ein Fall existiert.
 *
 * Ein Sortierstapel IST eine Akte (`akteArt = "sortierung"`) - nur eine ohne
 * Antragsteller, ohne Leadphase, ohne Objekt. Dadurch erbt er Speicher,
 * Upload-Pipeline, Buendelung und ZIP-Export unveraendert; nichts davon musste
 * fuer ihn ein zweites Mal gebaut werden.
 *
 * Der Preis steht in aktenart.ts: Jede org-weite Fallabfrage muss
 * `...nurVertrieb` tragen, sonst taucht ein Stapel als Geisterfall in Liste,
 * Kennzahl und Tagesliste auf. Ein Vertragstest haelt das fest.
 */

/** Praefix der Stapelnummern - bewusst nicht "UP-", damit Sortierstapel keine Fallnummern verbrauchen. */
export const STAPEL_PRAEFIX = "SORT";

/**
 * Nach dieser Zeit raeumt der naechtliche Cron einen Stapel weg.
 *
 * Ein Stapel traegt Gehaltsabrechnungen und Ausweise, ohne dass ein Fall
 * dahintersteht - also die heikelsten Daten ohne den Zweck, der sie
 * rechtfertigt. Vierzehn Tage sind lang genug, um ein vergessenes Ergebnis
 * noch einmal herunterzuladen, und kurz genug, dass sich nichts ansammelt.
 */
export const STAPEL_LEBENSDAUER_TAGE = 14;

/** Nummer des naechsten Stapels einer Organisation im laufenden Jahr. */
async function naechsteStapelnummer(organizationId: string, jahr: number): Promise<string> {
  const praefix = `${STAPEL_PRAEFIX}-${jahr}-`;
  const bestand = await prisma.case.findMany({
    where: { organizationId, ...nurSortierung, caseNumber: { startsWith: praefix } },
    select: { caseNumber: true },
  });
  // Numerisch, nicht lexikografisch: "…-9999" waere sonst groesser als
  // "…-10000" und die Vergabe liefe dauerhaft auf dieselbe Nummer.
  let hoechste = 0;
  for (const b of bestand) {
    const n = parseInt(b.caseNumber.slice(praefix.length), 10);
    if (Number.isFinite(n)) hoechste = Math.max(hoechste, n);
  }
  return `${praefix}${String(hoechste + 1).padStart(4, "0")}`;
}

/**
 * Legt einen leeren Stapel an und gibt seine Id zurueck.
 *
 * Kein Formular davor, keine Pflichtangabe: Der Sortierer ist fuer den
 * Augenblick gedacht, in dem jemand schnell einen Stapel ordnen will. Jede
 * Frage vor dem ersten Upload waere genau die Huerde, die er abschaffen soll.
 */
export async function erstelleStapel(input: {
  organizationId: string;
  userId: string;
}): Promise<{ id: string; nummer: string }> {
  const jahr = new Date().getFullYear();

  // Bis zu drei Versuche: Zwei gleichzeitige Anlagen bekommen dieselbe Nummer
  // berechnet, der Unique-Index (organizationId, caseNumber) laesst nur eine
  // durch. Erneut rechnen statt sperren - Stapel entstehen selten.
  for (let versuch = 0; versuch < 3; versuch += 1) {
    const nummer = await naechsteStapelnummer(input.organizationId, jahr);
    try {
      const akte = await prisma.case.create({
        data: {
          organizationId: input.organizationId,
          caseNumber: nummer,
          akteArt: "sortierung",
          status: "neu",
          // Der Anleger ist der Betreuer: Ohne ihn taucht der Stapel in keiner
          // persoenlichen Liste auf und das Protokoll weiss nicht, wem er gehoert.
          brokerId: input.userId,
        },
        select: { id: true, caseNumber: true },
      });
      await audit({
        organizationId: input.organizationId,
        userId: input.userId,
        action: "sortierer.stapel_angelegt",
        entityType: "case",
        entityId: akte.id,
        metadata: { nummer: akte.caseNumber },
      });
      return { id: akte.id, nummer: akte.caseNumber };
    } catch (e) {
      const kollision = (e as { code?: string }).code === "P2002";
      if (!kollision || versuch === 2) throw e;
    }
  }
  // Unerreichbar - die Schleife kehrt zurueck oder wirft.
  throw new Error("Stapel konnte nicht angelegt werden.");
}

export interface StapelZeile {
  id: string;
  nummer: string;
  /** Aus dem Inhalt abgeleitet, nicht von Hand vergeben (siehe stapelName). */
  name: string;
  dokumente: number;
  erstelltAm: Date;
  /** Tage bis zur automatischen Loeschung; nie negativ. */
  verbleibendeTage: number;
}

/**
 * Ein Name, der aus dem INHALT kommt statt aus einem Eingabefeld.
 *
 * Bewusst kein Umbenennen-Feld: Wer drei Stapel nebeneinander hat, erkennt sie
 * an dem, was drin ist ("Kaufvertrag + 2 weitere") - und nicht an einem Namen,
 * den er beim Hineinwerfen noch gar nicht wusste. Das spart ausserdem eine
 * Spalte an `Case`, die nur fuer diesen einen Zweck da waere.
 */
export function stapelName(typen: Array<DocumentType | null>, anzahl: number): string {
  const erkannt = [...new Set(typen.filter((t): t is DocumentType => Boolean(t)))];
  if (erkannt.length === 0) {
    return anzahl === 0 ? "Leerer Stapel" : `${anzahl} ${anzahl === 1 ? "Datei" : "Dateien"}`;
  }
  const erstes = DOCUMENT_TYPE_LABELS[erkannt[0]!] ?? "Unterlage";
  const weitere = erkannt.length - 1;
  return weitere === 0 ? erstes : `${erstes} + ${weitere} ${weitere === 1 ? "weitere" : "weitere"}`;
}

/** Tage bis zur automatischen Loeschung, nie negativ. */
export function verbleibendeTage(erstelltAm: Date, jetzt = new Date()): number {
  const vergangen = (jetzt.getTime() - erstelltAm.getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(STAPEL_LEBENSDAUER_TAGE - vergangen));
}

export async function listeStapel(organizationId: string): Promise<StapelZeile[]> {
  const stapel = await prisma.case.findMany({
    where: { organizationId, ...nurSortierung },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      caseNumber: true,
      createdAt: true,
      documents: { select: { documentType: true, zusammengefuegtInId: true } },
    },
  });
  return stapel.map((s) => {
    // Seiten, die in einem Buendel aufgegangen sind, zaehlen nicht doppelt:
    // Sonst zeigte ein fertig sortierter Stapel mehr Dateien als vorher.
    const sichtbar = s.documents.filter((d) => d.zusammengefuegtInId === null);
    return {
      id: s.id,
      nummer: s.caseNumber,
      name: stapelName(
        sichtbar.map((d) => d.documentType as DocumentType | null),
        sichtbar.length
      ),
      dokumente: sichtbar.length,
      erstelltAm: s.createdAt,
      verbleibendeTage: verbleibendeTage(s.createdAt),
    };
  });
}
