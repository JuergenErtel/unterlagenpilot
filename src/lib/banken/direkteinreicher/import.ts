import type { PrismaClient } from "@prisma/client";
import { parseDirekteinreicher, istLeererArtikel } from "./parsen";
import { bankNameAusTitel, ordneZu, istNeueBank } from "./zuordnen";
import { neueBankId } from "../produktuebersicht/import";

/**
 * Import der Direkteinreicherinformationen aus dem Europace-Wiki.
 *
 * Der Abzug (scripts/direkteinreicher-abzug.browser.js) liefert die rohen
 * Artikel; geparst und zugeordnet wird HIER, damit ein besserer Parser nie
 * einen neuen Abzug braucht.
 */

export interface RohArtikel {
  artikelId: number | string;
  titel: string;
  aktualisiert: string | null;
  body: string;
}

export interface RohAbzug {
  quelle?: string;
  geholtAm?: string;
  artikel: RohArtikel[];
}

export interface ImportBericht {
  bankenGeschrieben: number;
  bankenNeuAngelegt: number;
  personenGeschrieben: number;
  /** Artikel, deren Titel kein Direkteinreicher-Artikel ist (werden uebersprungen). */
  keinDirekteinreicherArtikel: string[];
  /** Artikel, die keiner Bank zuzuordnen waren – Kandidaten fuer zuordnung.json. */
  ohneZuordnung: string[];
  /** Zugeordnete Artikel, in denen der Parser keine Person fand (Anschrift/Hinweise trotzdem gespeichert). */
  ohnePersonen: string[];
  /** Zendesk-Platzhalter "Es gibt keine aktuellen Einträge" oder leer – nichts zu speichern. */
  leereArtikel: string[];
  /** Zuordnungen ueber die Ortsworte statt den ganzen Namen – von Hand pruefen. */
  unscharf: string[];
}

export async function importiereDirekteinreicher(
  prisma: PrismaClient,
  abzug: RohAbzug,
  jetzt = new Date()
): Promise<ImportBericht> {
  const bericht: ImportBericht = {
    bankenGeschrieben: 0,
    bankenNeuAngelegt: 0,
    personenGeschrieben: 0,
    keinDirekteinreicherArtikel: [],
    ohneZuordnung: [],
    ohnePersonen: [],
    leereArtikel: [],
    unscharf: [],
  };

  const banken = await prisma.bank.findMany({ select: { id: true, name: true } });

  for (const roh of abzug.artikel) {
    const name = bankNameAusTitel(roh.titel);
    if (!name) {
      bericht.keinDirekteinreicherArtikel.push(roh.titel);
      continue;
    }
    let zu = ordneZu(name, banken);
    if (!zu && istNeueBank(name)) {
      // Anbieter ohne Kriteriencheck – von Hand freigegeben (zuordnung.json).
      const neu = await prisma.bank.upsert({
        where: { bankId: neueBankId(name) },
        create: { bankId: neueBankId(name), name, zuletztGesehenAm: jetzt },
        update: {},
        select: { id: true, name: true },
      });
      banken.push(neu);
      bericht.bankenNeuAngelegt++;
      zu = { bank: neu, art: "hand" };
    }
    if (!zu) {
      bericht.ohneZuordnung.push(name);
      continue;
    }
    const bank = zu.bank;
    if (zu.art === "unscharf") bericht.unscharf.push(`${name} -> ${bank.name}`);
    if (istLeererArtikel(roh.body ?? "")) {
      bericht.leereArtikel.push(name);
      continue;
    }

    const info = parseDirekteinreicher(roh.body ?? "");
    if (info.ansprechpartner.length === 0) bericht.ohnePersonen.push(name);
    const standAm = roh.aktualisiert ? new Date(roh.aktualisiert) : null;
    const artikelId = String(roh.artikelId);

    await prisma.$transaction([
      prisma.bank.update({
        where: { id: bank.id },
        data: {
          anschrift: info.anschrift,
          direkteinreicherHinweis: info.hinweise,
          direkteinreicherStandAm: standAm,
        },
      }),
      prisma.bankAnsprechpartner.deleteMany({ where: { bankRefId: bank.id } }),
      prisma.bankAnsprechpartner.createMany({
        data: info.ansprechpartner.map((p, i) => ({
          bankRefId: bank.id,
          reihenfolge: i,
          name: p.name,
          funktion: p.funktion,
          telefon: p.telefon,
          email: p.email,
          artikelId,
          standAm,
          importiertAm: jetzt,
        })),
      }),
    ]);
    bericht.bankenGeschrieben++;
    bericht.personenGeschrieben += info.ansprechpartner.length;
  }

  return bericht;
}
