/**
 * Spielt den Europace-Abzug in die Datenbank.
 *
 *   npx tsx scripts/banken-wiki-import.ts data/europace-finanzierungskriterien.json
 *
 * Kein Cron: Der Europace-Endpunkt haengt an der angemeldeten Browsersitzung,
 * die ein Server nicht hat. Der Abzug wird von Hand geholt (siehe Spec),
 * dieses Skript spielt ihn ein. Mehrfach ausfuehrbar.
 *
 * ACHTUNG: Schreibt gegen die DATABASE_URL der Umgebung, in der es laeuft.
 */
import { readFileSync } from "node:fs";
import { importiereBanken, type AbzugBank } from "../src/lib/banken/import";

async function main() {
  const datei = process.argv[2] ?? "data/europace-finanzierungskriterien.json";
  const roh = JSON.parse(readFileSync(datei, "utf-8")) as {
    banken: AbzugBank[];
    geholtAm?: string;
  };

  if (!Array.isArray(roh.banken) || roh.banken.length === 0) {
    console.error(`Kein verwertbarer Abzug in ${datei}.`);
    process.exit(1);
  }

  console.log(`Spiele ${roh.banken.length} Banken aus ${datei} ein …`);
  const r = await importiereBanken(roh.banken);

  console.log(`Fertig: ${r.banken} Banken, ${r.zeilen} Kriterienzeilen.`);
  if (r.unbekannteStatus.length > 0) {
    console.warn(
      `Unbekannte Statuswerte (gespeichert, bitte pruefen): ${r.unbekannteStatus.join(", ")}`
    );
  }
  if (r.ohneKategorie.length > 0) {
    console.warn(`Ohne Kategorie, gelandet in "Sonstige": ${r.ohneKategorie.join(", ")}`);
  }
}

main().catch((e) => {
  console.error("Import fehlgeschlagen:", e);
  process.exit(1);
});
