/**
 * Setzt (oder entfernt) das platformAdmin-Kennzeichen.
 *
 *   npx tsx scripts/set-platform-admin.ts juergen.ertel@gmx.de
 *   npx tsx scripts/set-platform-admin.ts juergen.ertel@gmx.de --aus
 *
 * Laeuft gegen die DATABASE_URL der jeweiligen Umgebung.
 */
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
const an = !process.argv.includes("--aus");

if (!email) {
  console.error("Aufruf: npx tsx scripts/set-platform-admin.ts <email> [--aus]");
  process.exit(1);
}

const prisma = new PrismaClient();

const { count } = await prisma.user.updateMany({
  where: { email },
  data: { platformAdmin: an },
});

if (count === 0) {
  console.error(`Kein Nutzer mit dieser Adresse gefunden.`);
  process.exit(2);
}
console.log(`platformAdmin=${an} gesetzt (${count} Nutzer).`);
await prisma.$disconnect();
