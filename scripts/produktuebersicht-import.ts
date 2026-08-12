/**
 * Liest den Abzug der Europace-Produktuebersichten in die Datenbank.
 *
 *   npx tsx --env-file=.env scripts/produktuebersicht-import.ts data/europace-produktuebersichten.json
 *
 * Mehrfach ausfuehrbar: Der Import aktualisiert, statt zu verdoppeln.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { importiereProduktuebersichten, type RohAbzug } from "@/lib/banken/produktuebersicht/import";

async function main() {
  const datei = process.argv[2] ?? "data/europace-produktuebersichten.json";
  const abzug = JSON.parse(readFileSync(datei, "utf8")) as RohAbzug;
  console.log(`Abzug: ${datei} – ${abzug.banken.length} Banken, geholt am ${abzug.geholtAm ?? "?"}`);

  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
  const bericht = await importiereProduktuebersichten(prisma, abzug);
  await prisma.$disconnect();

  console.log(`Banken geschrieben : ${bericht.bankenGeschrieben}`);
  console.log(`  davon neu angelegt: ${bericht.bankenNeuAngelegt}`);
  console.log(`Merkmale geschrieben: ${bericht.merkmaleGeschrieben}`);
  if (bericht.zusammengefasst.length) console.log(`Doppelt im Artikel (laengere Fassung behalten): ${bericht.zusammengefasst.join(", ")}`);
  if (bericht.ohneZuordnung.length) console.log(`OHNE ZUORDNUNG: ${bericht.ohneZuordnung.join(", ")}`);
  if (bericht.zielFehlt.length) console.log(`ZIEL FEHLT: ${bericht.zielFehlt.join(", ")}`);
}

main();
