import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { istOhneAussage } from "../produktuebersicht/import";
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

    // Zweite Quelle: die Produktuebersichten aus dem Europace-Wiki. Sie fuehren
    // Angaben, die der Kriteriencheck nicht kennt – die Frage nach der
    // befristeten Aufenthaltsgenehmigung ist genau daran gescheitert, weil sie
    // dort unter "Bluecard" steht und nicht unter einem der 69 Kriterien.
    const merkmale = await prisma.bankProduktMerkmal.findMany({
      where: {
        OR: [
          ...(kriterien.length > 0 ? [{ bezeichnung: { in: kriterien } }] : []),
          ...stichwoerter
            .map(suchwort)
            .filter((w) => w.length >= 4)
            .slice(0, 5)
            .flatMap((wort) => [
              { bezeichnung: { contains: wort, mode: "insensitive" as const } },
              { wert: { contains: wort, mode: "insensitive" as const } },
            ]),
        ],
        ...(bankIds && bankIds.length > 0 ? { bank: { bankId: { in: bankIds } } } : {}),
      },
      select: {
        abschnitt: true,
        bezeichnung: true,
        wert: true,
        bank: { select: { bankId: true, name: true } },
      },
      orderBy: [{ bezeichnung: "asc" }, { bankRefId: "asc" }],
      take: MAX_ZEILEN,
    });

    return [
      ...zeilen.map((z) => ({
        bankId: z.bank.bankId,
        name: z.bank.name,
        kriterium: z.kriterium,
        status: z.status,
        inhalt: z.inhalt,
      })),
      ...merkmale.map((m) => ({
        bankId: m.bank.bankId,
        name: m.bank.name,
        // Der Abschnitt gehoert in den Namen: "Bluecard" allein sagt nicht, aus
        // welcher Ecke der Akte die Aussage kommt.
        kriterium: `${m.bezeichnung} (Produktübersicht, ${m.abschnitt})`,
        // "keine Angabe" ist auch hier keine Ablehnung – gleiche Regel wie im
        // Kriteriencheck, damit die Zeile die KI gar nicht erst erreicht.
        status: istOhneAussage(m.wert) ? "KEINE_ANGABE" : "INFORMATION",
        inhalt: m.wert,
      })),
    ];
  },

  async abzugStand() {
    const r = await prisma.bankKriterium.aggregate({ _max: { importiertAm: true } });
    return r._max.importiertAm ?? null;
  },
};
