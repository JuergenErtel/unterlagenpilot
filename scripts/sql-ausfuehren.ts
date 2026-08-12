/**
 * Führt eine SQL-Datei gegen die BaufiDesk-Datenbank aus.
 *
 *   scripts/supabase-sql.sh <datei.sql>            ausführen
 *   scripts/supabase-sql.sh <datei.sql> --dry-run  nur anzeigen, was liefe
 *   scripts/supabase-sql.sh <datei.sql> --force    auch mit DROP/TRUNCATE/DELETE
 *
 * Bis zum 12.08.2026 lief das über die Supabase-Management-API, weil die
 * DATABASE_URL in Vercel als sensitiv markiert und nicht auslesbar war.
 * Inzwischen liegt sie lokal in `.env` – und der kontoweite Personal Access
 * Token, den die Management-API verlangte, wurde ungültig. Ein Zugang weniger,
 * der alle Projekte des Kontos verwalten dürfte, ist ohnehin der bessere
 * Zustand.
 *
 * Bewusst eng gebaut: nimmt genau eine Datei entgegen, spricht genau eine
 * Datenbank an und schickt sonst nichts. Damit lässt sich das Skript freigeben,
 * ohne beliebige Datenbankzugriffe zu erlauben.
 */
import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const SCHEMA = "unterlagenpilot"; // BaufiDesk liegt NICHT in "public"

/** Liest .env selbst, damit der Aufruf ohne --env-file auskommt. */
function ausEnv(schluessel: string): string | null {
  if (process.env[schluessel]) return process.env[schluessel]!;
  if (!existsSync(".env")) return null;
  for (const zeile of readFileSync(".env", "utf8").split("\n")) {
    const treffer = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(zeile);
    if (treffer?.[1] === schluessel) return (treffer[2] ?? "").replace(/^"|"$/g, "");
  }
  return null;
}

/**
 * Zerlegt am Semikolon, hält aber $$-Blöcke zusammen – sonst zerfällt ein
 * DO-Block mitten im Rumpf.
 */
function inAnweisungen(sql: string): string[] {
  const raus: string[] = [];
  let puffer = "";
  let imBlock = false;
  for (const zeichen of sql) {
    puffer += zeichen;
    if (puffer.endsWith("$$")) imBlock = !imBlock;
    if (zeichen === ";" && !imBlock) {
      if (puffer.trim()) raus.push(puffer.trim());
      puffer = "";
    }
  }
  if (puffer.trim()) raus.push(puffer.trim());
  // Reine Kommentarbloecke sind keine Anweisungen – sonst steht am Ende einer
  // Datei mit Schlusskommentar eine sinnlose "0 Zeilen"-Meldung.
  return raus.filter((a) => ohneKommentare(a) !== "");
}

/** Entfernt Zeilen- und Blockkommentare; nur zum Pruefen, nie zum Ausfuehren. */
function ohneKommentare(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/[\s;]+/g, "")
    .trim();
}

/**
 * Zerstörerische Anweisungen.
 *
 * Bewusst schärfer als die alte Fassung: Die prüfte `(^|[^ ])(drop|truncate)`
 * und übersah damit jedes „ALTER TABLE x DROP COLUMN", weil dort ein Leerzeichen
 * vor DROP steht. "ON DELETE CASCADE" schlägt hier trotzdem nicht an, weil für
 * DELETE ausdrücklich ein "FROM" verlangt wird.
 */
function zerstoerend(sql: string): string[] {
  return sql
    .split("\n")
    .map((z, i) => [i + 1, z] as const)
    .filter(([, z]) => {
      const rein = z.replace(/--[^\n]*/g, " ");
      return /\b(drop|truncate)\b/i.test(rein) || /\bdelete\s+from\b/i.test(rein);
    })
    .map(([n, z]) => `${n}: ${z.trim()}`);
}

/** Erste Zeile einer Anweisung, gekuerzt – fuer die Ausgabe. */
const kopfzeile = (a: string, max: number) => (a.split("\n")[0] ?? a).slice(0, max);

const lesend = (a: string) => /^\s*(select|with|show|explain|table|values)\b/i.test(a);

async function main() {
  const datei = process.argv[2];
  const schalter = process.argv.slice(3);
  const trockenlauf = schalter.includes("--dry-run");
  const erzwingen = schalter.includes("--force");

  if (!datei) {
    console.error("Aufruf: scripts/supabase-sql.sh <datei.sql> [--dry-run] [--force]");
    process.exit(1);
  }
  if (!existsSync(datei)) {
    console.error(`Datei nicht gefunden: ${datei}`);
    process.exit(1);
  }

  const url = ausEnv("DIRECT_URL") ?? ausEnv("DATABASE_URL");
  if (!url) {
    console.error("Weder DIRECT_URL noch DATABASE_URL gefunden (weder in der Umgebung noch in .env).");
    process.exit(1);
  }
  // Nie den Zugang ausgeben – nur, wohin er zeigt.
  const ziel = /@([^/]+)\//.exec(url)?.[1] ?? "unbekannt";

  const sql = readFileSync(datei, "utf8");
  const anweisungen = inAnweisungen(sql);

  console.log(`Ziel   : ${ziel} (PRODUKTIV)`);
  console.log(`Schema : ${SCHEMA}`);
  console.log(`Datei  : ${datei} (${anweisungen.length} Anweisung(en))`);

  const gefahr = zerstoerend(sql);
  if (gefahr.length > 0) {
    console.error(`\nACHTUNG: ${gefahr.length} Zeile(n) mit DROP/TRUNCATE/DELETE FROM:`);
    for (const z of gefahr) console.error("  " + z);
    if (!erzwingen && !trockenlauf) {
      console.error("\nAbgebrochen. Wenn das so gewollt ist: noch einmal mit --force.");
      process.exit(1);
    }
  }

  if (trockenlauf) {
    console.log("\n--- Trockenlauf, es wird nichts ausgeführt. Laufen würde: ---");
    anweisungen.forEach((a, i) => console.log(`  ${i + 1}. ${kopfzeile(a, 110)}`));
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  console.log("\n--- Wird ausgeführt ---");
  try {
    // EINE Transaktion, EINE Verbindung: Sonst gilt das gesetzte search_path
    // nicht für die folgenden Anweisungen, weil der Pool die Verbindung
    // wechseln darf. Nebenwirkung, die hier erwünscht ist: Schlägt eine
    // Anweisung fehl, wird die ganze Datei zurückgerollt.
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET search_path TO "${SCHEMA}"`);
        for (const [i, anweisung] of anweisungen.entries()) {
          const kopf = kopfzeile(anweisung, 100);
          if (lesend(anweisung)) {
            const zeilen = (await tx.$queryRawUnsafe(anweisung)) as unknown[];
            console.log(`  ${i + 1}. ${kopf}`);
            for (const z of zeilen.slice(0, 20)) console.log("       " + JSON.stringify(z));
            if (zeilen.length > 20) console.log(`       … ${zeilen.length - 20} weitere Zeilen`);
          } else {
            const betroffen = await tx.$executeRawUnsafe(anweisung);
            console.log(`  ${i + 1}. ${kopf}  → ${betroffen} Zeile(n)`);
          }
        }
      },
      { timeout: 120_000, maxWait: 20_000 }
    );
    console.log("Erfolgreich.");
  } catch (err) {
    console.error("\nFehlgeschlagen – nichts wurde übernommen (Transaktion zurückgerollt).");
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
