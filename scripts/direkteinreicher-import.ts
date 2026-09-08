/**
 * Liest den Abzug der Direkteinreicherinformationen in die Datenbank.
 *
 *   npx tsx --env-file=.env scripts/direkteinreicher-import.ts data/europace-direkteinreicher.json
 *
 * Mehrfach ausfuehrbar: Der Import ersetzt die Ansprechpartner je Bank.
 * Abzug: scripts/direkteinreicher-abzug.browser.js im angemeldeten Zendesk-Tab.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { importiereDirekteinreicher, type RohAbzug } from "@/lib/banken/direkteinreicher/import";

async function main() {
  const datei = process.argv[2] ?? "data/europace-direkteinreicher.json";
  const abzug = JSON.parse(readFileSync(datei, "utf8")) as RohAbzug;
  console.log(`Abzug: ${datei} – ${abzug.artikel.length} Artikel, geholt am ${abzug.geholtAm ?? "?"}`);

  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
  const b = await importiereDirekteinreicher(prisma, abzug);
  await prisma.$disconnect();

  console.log(`Banken geschrieben  : ${b.bankenGeschrieben}`);
  console.log(`Personen geschrieben: ${b.personenGeschrieben}`);
  if (b.keinDirekteinreicherArtikel.length)
    console.log(`Uebersprungen (kein Direkteinreicher-Artikel): ${b.keinDirekteinreicherArtikel.length}`);
  if (b.ohnePersonen.length) console.log(`OHNE PERSONEN (${b.ohnePersonen.length}): ${b.ohnePersonen.join(" | ")}`);
  if (b.ohneZuordnung.length) console.log(`OHNE ZUORDNUNG (${b.ohneZuordnung.length}): ${b.ohneZuordnung.join(" | ")}`);
}

main();
