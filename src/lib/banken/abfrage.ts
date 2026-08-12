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

/** Wieviele Banken im Wiki stehen – fuer Ueberschriften und Fortschritt. */
export async function zaehleBanken(): Promise<number> {
  return prisma.bank.count();
}

export interface ProduktMerkmal {
  abschnitt: string;
  unterabschnitt: string;
  bezeichnung: string;
  wert: string;
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
  /**
   * Zeilen aus der Produktuebersicht des Europace-Wikis – eine ZWEITE Quelle
   * neben dem Kriteriencheck. Nur 28 Banken haben sie; bei allen anderen bleibt
   * die Liste leer, und die Seite zeigt den Abschnitt dann gar nicht.
   */
  merkmale: ProduktMerkmal[];
  /** Wann Europace den Wiki-Artikel zuletzt geaendert hat. */
  merkmaleStandAm: Date | null;
}

export async function ladeBank(bankId: string): Promise<BankDetail | null> {
  const bank = await prisma.bank.findUnique({
    where: { bankId },
    include: {
      kriterien: { orderBy: { kriterium: "asc" } },
      produktMerkmale: { orderBy: [{ abschnitt: "asc" }, { unterabschnitt: "asc" }, { bezeichnung: "asc" }] },
    },
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
    merkmale: bank.produktMerkmale.map((m) => ({
      abschnitt: m.abschnitt,
      unterabschnitt: m.unterabschnitt,
      bezeichnung: m.bezeichnung,
      wert: m.wert,
    })),
    merkmaleStandAm: bank.produktMerkmale[0]?.standAm ?? null,
  };
}
