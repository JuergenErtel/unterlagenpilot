import type { PrismaClient } from "@prisma/client";
import zuordnung from "./zuordnung.json";

/**
 * Import der Produktuebersichten aus dem Europace-Wiki.
 *
 * Zweite Quelle neben dem Kriteriencheck: Nur 28 der 685 Wiki-Artikel fuehren
 * diese Tabelle, dafuer die ueberregionalen Anbieter. Sie enthaelt Angaben, die
 * es im Kriteriencheck nicht gibt – etwa die Zeile "Bluecard".
 */

export interface RohMerkmal {
  abschnitt: string;
  unterabschnitt: string | null;
  bezeichnung: string;
  wert: string;
}

export interface RohBank {
  artikelId: number | string;
  titel: string;
  name: string;
  aktualisiert: string | null;
  merkmale: RohMerkmal[];
}

export interface RohAbzug {
  quelle?: string;
  geholtAm?: string;
  banken: RohBank[];
}

export interface ImportBericht {
  bankenGeschrieben: number;
  bankenNeuAngelegt: number;
  merkmaleGeschrieben: number;
  /** Artikel, fuer die die Zuordnung keinen Eintrag hat. */
  ohneZuordnung: string[];
  /** Zugeordnete Banken, die es in der Datenbank nicht gibt. */
  zielFehlt: string[];
  /** Zeilen, die in EINEM Artikel doppelt vorkamen (siehe `entdoppele`). */
  zusammengefasst: string[];
}

const AUF_VORHANDENE: Record<string, string> = zuordnung.aufVorhandeneBank;
const NEUE: string[] = zuordnung.neueBank;

/**
 * Kennung fuer eine neu anzulegende Bank.
 *
 * Bewusst mit Vorsilbe: Diese Banken stammen NICHT aus dem Kriteriencheck, und
 * eine erfundene Europace-Kennung waere eine Behauptung ueber deren Bestand.
 */
export function neueBankId(name: string): string {
  return (
    "WIKI_" +
    name
      .toUpperCase()
      .replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE").replace(/ß/g, "SS")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
  );
}

/**
 * Fasst Zeilen zusammen, die in EINEM Artikel mehrfach vorkommen.
 *
 * Die Deutsche Bank fuehrt "Selbststaendige" zweimal: einmal "ja", einmal mit
 * Erlaeuterung. Ohne diesen Schritt entschiede die Reihenfolge, welche Fassung
 * ueberlebt – und zwar stillschweigend. Es gewinnt die laengere, weil sie den
 * kuerzeren Satz in aller Regel enthaelt.
 */
export function entdoppele(merkmale: RohMerkmal[]): { merkmale: RohMerkmal[]; zusammengefasst: string[] } {
  const nachSchluessel = new Map<string, RohMerkmal>();
  const zusammengefasst: string[] = [];
  for (const m of merkmale) {
    const schluessel = [m.abschnitt, m.unterabschnitt ?? "", m.bezeichnung].join("|");
    const vorhanden = nachSchluessel.get(schluessel);
    if (!vorhanden) {
      nachSchluessel.set(schluessel, m);
      continue;
    }
    zusammengefasst.push(schluessel);
    if ((m.wert ?? "").length > (vorhanden.wert ?? "").length) nachSchluessel.set(schluessel, m);
  }
  return { merkmale: [...nachSchluessel.values()], zusammengefasst };
}

/** Leerer Wert oder woertlich "keine Angabe" – beides ist KEINE Aussage. */
export function istOhneAussage(wert: string): boolean {
  return /^(keine angabe|k\.a\.|—|-)?$/i.test((wert ?? "").trim());
}

export async function importiereProduktuebersichten(
  prisma: PrismaClient,
  abzug: RohAbzug,
  jetzt = new Date()
): Promise<ImportBericht> {
  const bericht: ImportBericht = {
    bankenGeschrieben: 0,
    bankenNeuAngelegt: 0,
    merkmaleGeschrieben: 0,
    ohneZuordnung: [],
    zielFehlt: [],
    zusammengefasst: [],
  };

  for (const roh of abzug.banken) {
    const zielName = AUF_VORHANDENE[roh.name];
    const istNeu = NEUE.includes(roh.name);
    if (!zielName && !istNeu) {
      // Nicht raten: Ein Teilstringvergleich ordnete "Hannoversche" (den
      // Versicherer) der "Hannoversche Volksbank" zu.
      bericht.ohneZuordnung.push(roh.name);
      continue;
    }

    let bank = zielName
      ? await prisma.bank.findFirst({ where: { name: zielName }, select: { id: true } })
      : await prisma.bank.findUnique({ where: { bankId: neueBankId(roh.name) }, select: { id: true } });

    if (!bank && istNeu) {
      bank = await prisma.bank.create({
        data: { bankId: neueBankId(roh.name), name: roh.name, zuletztGesehenAm: jetzt },
        select: { id: true },
      });
      bericht.bankenNeuAngelegt++;
    }
    if (!bank) {
      bericht.zielFehlt.push(`${roh.name} -> ${zielName}`);
      continue;
    }

    const standAm = roh.aktualisiert ? new Date(roh.aktualisiert) : null;
    const { merkmale, zusammengefasst } = entdoppele(roh.merkmale);
    bericht.zusammengefasst.push(...zusammengefasst.map((k) => `${roh.name}: ${k}`));
    for (const m of merkmale) {
      const schluessel = {
        bankRefId: bank.id,
        abschnitt: m.abschnitt,
        unterabschnitt: m.unterabschnitt ?? "",
        bezeichnung: m.bezeichnung,
      };
      await prisma.bankProduktMerkmal.upsert({
        where: { bankRefId_abschnitt_unterabschnitt_bezeichnung: schluessel },
        create: {
          ...schluessel,
          wert: m.wert ?? "",
          artikelId: String(roh.artikelId),
          standAm,
          importiertAm: jetzt,
        },
        update: {
          wert: m.wert ?? "",
          artikelId: String(roh.artikelId),
          standAm,
          importiertAm: jetzt,
        },
      });
      bericht.merkmaleGeschrieben++;
    }
    bericht.bankenGeschrieben++;
  }

  return bericht;
}
