import { execFileSync } from "node:child_process";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Startet eine PGlite-Datenbank mit dem AKTUELLEN Prisma-Schema und haengt den
 * Client an globalThis, damit `@/lib/db` ihn beim ersten Import uebernimmt.
 *
 * WICHTIG: erst aufrufen, DANN die zu testenden Module dynamisch importieren –
 * `src/lib/db.ts` liest globalThis.prisma nur beim Laden des Moduls.
 */
export async function startPGlite(): Promise<any> {
  process.env.UP_SEED_NO_AUTORUN = "1";

  const ddl = execFileSync(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--script",
    ],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
  );

  const { PGlite } = await import("@electric-sql/pglite");
  const { PrismaPGlite } = await import("pglite-prisma-adapter");
  const { PrismaClient } = await import("@prisma/client");

  const pg = new PGlite();
  await pg.exec(ddl);
  const adapter = new PrismaPGlite(pg) as never;
  const prisma = new PrismaClient({ adapter });
  (globalThis as any).prisma = prisma;
  return prisma;
}
