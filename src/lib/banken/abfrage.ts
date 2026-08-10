import { prisma } from "@/lib/db";
import { passtZurSuche } from "./suche";

export interface BankTreffer {
  bankId: string;
  name: string;
  /** Anzahl echter Einschraenkungen (nicht machbar + unter Vorbehalt). */
  urteile: number;
}

/**
 * Banken zur Suche.
 *
 * 664 Namen passen muehelos in den Speicher – deshalb wird im Prozess
 * gefiltert statt mit einer datenbankseitigen Textsuche, die Umlaute anders
 * behandelt als der Nutzer erwartet ("muenchen" soll "München" finden).
 *
 * Die Einschraenkungen kommen aus EINER Gruppierung statt aus 664 Einzelzaehlern.
 */
export async function sucheBanken(q: string, limit = 50): Promise<BankTreffer[]> {
  const [banken, zaehler] = await Promise.all([
    prisma.bank.findMany({
      select: { id: true, bankId: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.bankKriterium.groupBy({
      by: ["bankRefId"],
      where: { status: { in: ["NICHT_MACHBAR", "VORBEHALTLICH"] } },
      _count: { _all: true },
    }),
  ]);

  const proBank = new Map(zaehler.map((z) => [z.bankRefId, z._count._all]));

  return banken
    .filter((b) => passtZurSuche(b.name, q))
    .slice(0, limit)
    .map((b) => ({ bankId: b.bankId, name: b.name, urteile: proBank.get(b.id) ?? 0 }));
}

export interface BankDetail {
  name: string;
  /** Wann WIR den Abzug geholt haben – nicht zu verwechseln mit standAm. */
  importiertAm: Date | null;
  kriterien: Array<{
    kriterium: string;
    kategorie: string;
    status: string;
    inhalt: string;
    standAm: Date | null;
  }>;
}

export async function ladeBank(bankId: string): Promise<BankDetail | null> {
  const bank = await prisma.bank.findUnique({
    where: { bankId },
    include: { kriterien: { orderBy: { kriterium: "asc" } } },
  });
  if (!bank) return null;

  return {
    name: bank.name,
    importiertAm: bank.kriterien[0]?.importiertAm ?? null,
    kriterien: bank.kriterien.map((k) => ({
      kriterium: k.kriterium,
      kategorie: k.kategorie,
      status: k.status,
      inhalt: k.inhalt,
      standAm: k.standAm,
    })),
  };
}
