import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { BankName } from "./deuten";
import type { Zeile } from "./sammeln";

/**
 * Datenbankzugriffe des Frage-Features – bewusst getrennt von der
 * Orchestrierung, damit diese ohne Datenbank testbar bleibt.
 */
export interface Bestand {
  bankNamen(): Promise<BankName[]>;
  zeilen(
    kriterien: string[],
    stichwoerter: string[],
    bankIds: string[] | null
  ): Promise<Zeile[]>;
  abzugStand(): Promise<Date | null>;
}

/** Obergrenze fuer das Stichwort-Auffangnetz – schuetzt vor einem Allerweltswort. */
const MAX_ZEILEN = 5000;

/** Ein Stichwort kann eine Wortgruppe sein; fuer LIKE zaehlt das laengste Wort. */
function suchwort(stichwort: string): string {
  return (stichwort ?? "")
    .split(/\s+/)
    .reduce((a, b) => (b.length > a.length ? b : a), "")
    .trim();
}

export const prismaBestand: Bestand = {
  async bankNamen() {
    return prisma.bank.findMany({
      select: { bankId: true, name: true },
      orderBy: { name: "asc" },
    });
  },

  async zeilen(kriterien, stichwoerter, bankIds) {
    const oder: Prisma.BankKriteriumWhereInput[] = [];
    if (kriterien.length > 0) oder.push({ kriterium: { in: kriterien } });

    // Auffangnetz: Wenn die Deutung das Kriterium verfehlt hat, findet der
    // Freitext den Treffer trotzdem – quer ueber alle Kriterien.
    for (const wort of stichwoerter.map(suchwort).filter((w) => w.length >= 4).slice(0, 5)) {
      oder.push({ inhalt: { contains: wort, mode: "insensitive" } });
    }
    if (oder.length === 0) return [];

    const zeilen = await prisma.bankKriterium.findMany({
      where: {
        OR: oder,
        ...(bankIds && bankIds.length > 0 ? { bank: { bankId: { in: bankIds } } } : {}),
      },
      select: {
        kriterium: true,
        status: true,
        inhalt: true,
        bank: { select: { bankId: true, name: true } },
      },
      orderBy: [{ kriterium: "asc" }, { bankRefId: "asc" }],
      take: MAX_ZEILEN,
    });

    return zeilen.map((z) => ({
      bankId: z.bank.bankId,
      name: z.bank.name,
      kriterium: z.kriterium,
      status: z.status,
      inhalt: z.inhalt,
    }));
  },

  async abzugStand() {
    const r = await prisma.bankKriterium.aggregate({ _max: { importiertAm: true } });
    return r._max.importiertAm ?? null;
  },
};
