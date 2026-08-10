/**
 * Erzeugt aus dem Europace-Abzug SQL-Dateien fuer scripts/supabase-sql.sh.
 *
 *   npx tsx scripts/banken-wiki-sql.ts data/europace-finanzierungskriterien.json out/
 *
 * Warum nicht einfach scripts/banken-wiki-import.ts gegen die Produktion?
 * Die DATABASE_URL der Produktion ist in Vercel als sensitiv markiert und
 * nicht auslesbar; der einzige Schreibweg von hier ist die Management-API.
 *
 * Inhalt und Kategorie kommen aus denselben geprueften Funktionen wie beim
 * Prisma-Import (bereinigeHtml, kategorieFuer) – hier wird nur der
 * Schreibweg getauscht, nicht die Logik.
 *
 * Die Schluessel sind aus bankId bzw. bankId+Kriterium abgeleitet, damit ein
 * zweiter Lauf dieselben Zeilen trifft statt neue anzulegen.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bereinigeHtml } from "../src/lib/banken/bereinigen";
import { kategorieFuer } from "../src/lib/banken/kategorien";
import { BEKANNTE_STATUS } from "../src/lib/banken/status";
import type { AbzugBank } from "../src/lib/banken/import";

/** Postgres-Literal. Einfache Anfuehrungszeichen verdoppeln, sonst nichts. */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

const kurzHash = (s: string, len: number) =>
  createHash("sha1").update(s).digest("hex").slice(0, len);

const zeitstempel = (s: string | null): string | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

function main() {
  const quelle = process.argv[2] ?? "data/europace-finanzierungskriterien.json";
  const ziel = process.argv[3] ?? "out/banken-sql";
  const proDatei = 400; // Kriterienzeilen je SQL-Datei

  const roh = JSON.parse(readFileSync(quelle, "utf-8")) as { banken: AbzugBank[] };
  const jetzt = new Date().toISOString();
  mkdirSync(ziel, { recursive: true });

  const unbekannteStatus = new Set<string>();
  const ohneKategorie = new Set<string>();

  // 1) Banken – eine Datei, 664 Zeilen.
  const bankZeilen: string[] = [];
  const refIdVon = new Map<string, string>();
  for (const b of roh.banken) {
    const id = `bnk_${kurzHash(b.bankId, 20)}`;
    refIdVon.set(b.bankId, id);
    bankZeilen.push(`(${lit(id)}, ${lit(b.bankId)}, ${lit(b.name)}, ${lit(jetzt)}::timestamp)`);
  }
  writeFileSync(
    join(ziel, "00-banken.sql"),
    `INSERT INTO "banken" ("id", "bankId", "name", "zuletztGesehenAm") VALUES\n` +
      bankZeilen.join(",\n") +
      `\nON CONFLICT ("bankId") DO UPDATE SET\n` +
      `  "name" = EXCLUDED."name", "zuletztGesehenAm" = EXCLUDED."zuletztGesehenAm";\n`
  );

  // 2) Kriterien – gestueckelt, damit keine Anfrage zu gross wird.
  const alle: string[] = [];
  for (const b of roh.banken) {
    const refId = refIdVon.get(b.bankId)!;
    for (const k of b.kriterien) {
      if (!(BEKANNTE_STATUS as readonly string[]).includes(k.status)) unbekannteStatus.add(k.status);
      const kategorie = kategorieFuer(k.criterionName);
      if (kategorie === "Sonstige") ohneKategorie.add(k.criterionName);

      const id = `bkr_${kurzHash(`${b.bankId}|${k.criterionName}`, 24)}`;
      const stand = zeitstempel(k.lastUpdated);
      alle.push(
        `(${lit(id)}, ${lit(refId)}, ${lit(k.criterionName)}, ${lit(kategorie)}, ` +
          `${lit(k.status)}, ${lit(bereinigeHtml(k.content))}, ` +
          `${stand === null ? "NULL" : `${lit(stand)}::timestamp`}, ${lit(jetzt)}::timestamp)`
      );
    }
  }

  let teil = 0;
  for (let i = 0; i < alle.length; i += proDatei) {
    teil++;
    const nummer = String(teil).padStart(3, "0");
    writeFileSync(
      join(ziel, `${nummer}-kriterien.sql`),
      `INSERT INTO "bank_kriterien" ("id", "bankRefId", "kriterium", "kategorie", "status", "inhalt", "standAm", "importiertAm") VALUES\n` +
        alle.slice(i, i + proDatei).join(",\n") +
        `\nON CONFLICT ("bankRefId", "kriterium") DO UPDATE SET\n` +
        `  "kategorie" = EXCLUDED."kategorie", "status" = EXCLUDED."status",\n` +
        `  "inhalt" = EXCLUDED."inhalt", "standAm" = EXCLUDED."standAm",\n` +
        `  "importiertAm" = EXCLUDED."importiertAm";\n`
    );
  }

  console.log(`${bankZeilen.length} Banken, ${alle.length} Kriterienzeilen in ${teil + 1} Dateien unter ${ziel}.`);
  if (unbekannteStatus.size > 0) {
    console.warn(`Unbekannte Statuswerte: ${[...unbekannteStatus].join(", ")}`);
  }
  if (ohneKategorie.size > 0) {
    console.warn(`Ohne Kategorie (${ohneKategorie.size}): ${[...ohneKategorie].slice(0, 30).join(", ")}`);
  }
}

main();
