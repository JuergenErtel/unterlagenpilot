import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BACKOFFICE_STATUS, AKTE_ARTEN, BACKOFFICE_ROLLEN } from "@/lib/domain/enums";

/**
 * Vertragstest: Backoffice-Akten duerfen in keiner Vertriebsliste, keiner
 * Kennzahl und keinem Kontingent auftauchen. Die Regel dafuer ist der Filter
 * `nurVertrieb` (src/lib/cases/aktenart.ts). Er laesst sich nicht vom
 * Typsystem erzwingen - eine org-weite Abfrage ohne ihn kompiliert genauso.
 * Deshalb prueft dieser Test, dass jede bekannte Vertriebsabfrage den Namen
 * referenziert. Wer eine neue Stelle baut, traegt sie hier ein.
 */

const WURZEL = resolve(__dirname, "..");

function lies(pfad: string): string {
  return readFileSync(resolve(WURZEL, pfad), "utf-8");
}

const VERTRIEBSABFRAGEN = [
  "src/lib/cases/heute-daten.ts",
  "src/lib/cases/dashboard.ts",
  "src/components/dashboard/board-ansicht.tsx",
  "src/components/dashboard/arbeits-ansicht.tsx",
  "src/app/(app)/cases/page.tsx",
  "src/app/(app)/review/page.tsx",
  "src/lib/cases/service.ts",
  "src/lib/saas/plans.ts",
  "src/app/api/cron/reminders/route.ts",
];

describe("Vertriebsabfragen tragen den Vertriebsfilter", () => {
  for (const pfad of VERTRIEBSABFRAGEN) {
    it(`${pfad} referenziert nurVertrieb`, () => {
      expect(lies(pfad)).toMatch(/\bnurVertrieb\b/);
    });
  }

  it("definiert den Filter genau einmal als Aktenart vertrieb", () => {
    const quelle = lies("src/lib/cases/aktenart.ts");
    expect(quelle).toMatch(/export const nurVertrieb = \{ akteArt: "vertrieb"/);
    expect(quelle).toMatch(/export const nurBackoffice = \{ akteArt: "backoffice"/);
  });
});

// ---------------------------------------------------------------------------
// SQL-Skript fuer PROD
// ---------------------------------------------------------------------------

const SQL_PFAD = "sql/2026-09-02-backoffice.sql";

/** Skript ohne Kommentarzeilen - der Kopf sagt selbst "kein DROP". */
function sqlOhneKommentare(): string {
  return lies(SQL_PFAD)
    .split("\n")
    .filter((z) => !z.trim().startsWith("--"))
    .join("\n");
}

const NEUE_TABELLEN = [
  "backoffice_auftraggeber",
  "backoffice_auftraggeber_kontakte",
  "backoffice_auftraege",
  "backoffice_auftrag_ereignisse",
  "backoffice_rueckfragen",
  "backoffice_kontingent_ereignisse",
];

describe("SQL-Skript 2026-09-02-backoffice.sql", () => {
  const sql = sqlOhneKommentare();

  it("räumt nichts ab – kein DROP, kein TRUNCATE, kein DELETE FROM", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    // "ON DELETE CASCADE" in Fremdschluesseln ist kein Loeschbefehl.
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("legt jede neue Tabelle des Prisma-Schemas idempotent an", () => {
    for (const tabelle of NEUE_TABELLEN) {
      expect(sql, tabelle).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS "${tabelle}"`));
    }
  });

  it("kennt keine anderen Tabellen als die des Prisma-Schemas", () => {
    const angelegt = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS "([^"]+)"/g)].map((m) => m[1]);
    expect(angelegt.sort()).toEqual([...NEUE_TABELLEN].sort());
  });

  it("legt jede neue Tabelle nur mit IF NOT EXISTS an", () => {
    expect(sql).not.toMatch(/CREATE TABLE(?! IF NOT EXISTS)/);
  });

  it("ergänzt akteArt und backofficeRolle nur, wenn die Spalte fehlt", () => {
    expect(sql).toMatch(/ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "akteArt"/);
    expect(sql).toMatch(/ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "backofficeRolle"/);
    expect(sql).toMatch(/ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "backofficeSlaTage"/);
    expect(sql).not.toMatch(/ADD COLUMN(?! IF NOT EXISTS)/);
  });

  it("gibt Bestandsfällen die Aktenart vertrieb als Vorgabe, ohne Zeilen umzuschreiben", () => {
    expect(sql).toMatch(/"akteArt" "AkteArt" NOT NULL DEFAULT 'vertrieb'/);
    expect(sql).not.toMatch(/UPDATE "cases"/);
  });

  it("stimmt in den Enum-Werten mit dem Code überein", () => {
    const status = sql.match(/CREATE TYPE "BackofficeStatus" AS ENUM \(([^)]*)\)/)?.[1] ?? "";
    const werte = [...status.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(werte).toEqual([...BACKOFFICE_STATUS]);

    const akte = sql.match(/CREATE TYPE "AkteArt" AS ENUM \(([^)]*)\)/)?.[1] ?? "";
    expect([...akte.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...AKTE_ARTEN]);

    const rollen = sql.match(/CREATE TYPE "BackofficeRolle" AS ENUM \(([^)]*)\)/)?.[1] ?? "";
    expect([...rollen.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...BACKOFFICE_ROLLEN]);
  });
});

// ---------------------------------------------------------------------------
// Prisma-Enum gegen Code-Enum
// ---------------------------------------------------------------------------

function prismaEnumWerte(name: string): string[] {
  const schema = lies("prisma/schema.prisma");
  const block = schema.match(new RegExp(`\\benum ${name} \\{([^}]*)\\}`))?.[1];
  if (!block) throw new Error(`Prisma-Enum ${name} nicht gefunden`);
  return block
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => z && !z.startsWith("//"));
}

describe("Prisma-Enums gegen die Code-Enums", () => {
  it("BACKOFFICE_STATUS entspricht exakt dem Prisma-Enum BackofficeStatus", () => {
    expect([...BACKOFFICE_STATUS]).toEqual(prismaEnumWerte("BackofficeStatus"));
  });

  it("AKTE_ARTEN entspricht exakt dem Prisma-Enum AkteArt", () => {
    expect([...AKTE_ARTEN]).toEqual(prismaEnumWerte("AkteArt"));
  });

  it("BACKOFFICE_ROLLEN entspricht exakt dem Prisma-Enum BackofficeRolle", () => {
    expect([...BACKOFFICE_ROLLEN]).toEqual(prismaEnumWerte("BackofficeRolle"));
  });
});
