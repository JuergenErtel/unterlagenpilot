import { prisma } from "@/lib/db";
import { bereinigeHtml } from "./bereinigen";
import { kategorieFuer } from "./kategorien";
import { BEKANNTE_STATUS } from "./status";

export interface AbzugKriterium {
  criterionName: string;
  status: string;
  content: string;
  lastUpdated: string | null;
}

export interface AbzugBank {
  bankId: string;
  name: string;
  kriterien: AbzugKriterium[];
}

export interface ImportErgebnis {
  banken: number;
  zeilen: number;
  /** Statuswerte, die wir nicht kennen – gespeichert, aber gemeldet. */
  unbekannteStatus: string[];
  /** Kriterien ohne Kategoriezuordnung – gelandet in "Sonstige". */
  ohneKategorie: string[];
}

const alsDatum = (s: string | null): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Schreibt einen Abzug per Upsert. Mehrfach ausfuehrbar: derselbe Abzug zweimal
 * eingespielt erzeugt keine Dubletten, ein neuerer aktualisiert die Zeilen.
 *
 * Unbekannte Statuswerte und Kriterien ohne Kategorie werden GEMELDET, nicht
 * verschluckt – Europace kann den Katalog jederzeit erweitern, und das soll
 * auffallen, statt still danebenzulaufen.
 */
export async function importiereBanken(
  banken: AbzugBank[],
  jetzt: Date = new Date()
): Promise<ImportErgebnis> {
  const unbekannteStatus = new Set<string>();
  const ohneKategorie = new Set<string>();
  let zeilen = 0;

  for (const b of banken) {
    const bank = await prisma.bank.upsert({
      where: { bankId: b.bankId },
      create: { bankId: b.bankId, name: b.name, zuletztGesehenAm: jetzt },
      update: { name: b.name, zuletztGesehenAm: jetzt },
    });

    for (const k of b.kriterien) {
      if (!(BEKANNTE_STATUS as readonly string[]).includes(k.status)) {
        unbekannteStatus.add(k.status);
      }
      const kategorie = kategorieFuer(k.criterionName);
      if (kategorie === "Sonstige") ohneKategorie.add(k.criterionName);

      const werte = {
        kategorie,
        status: k.status,
        inhalt: bereinigeHtml(k.content),
        standAm: alsDatum(k.lastUpdated),
        importiertAm: jetzt,
      };

      await prisma.bankKriterium.upsert({
        where: { bankRefId_kriterium: { bankRefId: bank.id, kriterium: k.criterionName } },
        create: { bankRefId: bank.id, kriterium: k.criterionName, ...werte },
        update: werte,
      });
      zeilen++;
    }
  }

  return {
    banken: banken.length,
    zeilen,
    unbekannteStatus: [...unbekannteStatus],
    ohneKategorie: [...ohneKategorie],
  };
}
