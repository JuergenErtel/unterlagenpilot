/**
 * Legt realistische Demo-Fälle über alle Leadphasen an, damit das
 * Pipeline-Board lokal wie im Alltag aussieht. Nur für die lokale
 * PGlite-DB gedacht – nie gegen PROD laufen lassen.
 */
import { PrismaClient, LeadPhase, CaseStatus, LeadSource } from "@prisma/client";

const prisma = new PrismaClient();

type Demo = {
  nr: string;
  vor1: string; nach1: string;
  vor2?: string; nach2?: string;
  phase: LeadPhase;
  status: CaseStatus;
  quelle: LeadSource;
  kaufpreis: number | null;
  eigenkapital: number | null;
  darlehen: number | null;
  nettoeinkommen: number;
  tageInPhase: number;
  verloren?: string;
};

const faelle: Demo[] = [
  { nr: "UP-2026-0002", vor1: "Sabine", nach1: "Krüger", phase: "neu", status: "neu", quelle: "immoscout24", kaufpreis: 485000, eigenkapital: 90000, darlehen: 420000, nettoeinkommen: 5200, tageInPhase: 0 },
  { nr: "UP-2026-0003", vor1: "Tobias", nach1: "Lindner", vor2: "Anna", nach2: "Lindner", phase: "neu", status: "upload_offen", quelle: "baufi24", kaufpreis: 320000, eigenkapital: 15000, darlehen: 330000, nettoeinkommen: 3400, tageInPhase: 2 },
  { nr: "UP-2026-0004", vor1: "Miriam", nach1: "Schäfer", phase: "anfrage_erstellt", status: "upload_offen", quelle: "immoscout24", kaufpreis: 610000, eigenkapital: 140000, darlehen: 510000, nettoeinkommen: 6800, tageInPhase: 1 },
  { nr: "UP-2026-0005", vor1: "Daniel", nach1: "Voss", vor2: "Lea", nach2: "Voss", phase: "selbstauskunft_laeuft", status: "unterlagen_fehlen", quelle: "vergleich_de", kaufpreis: 398000, eigenkapital: 60000, darlehen: 365000, nettoeinkommen: 4600, tageInPhase: 5 },
  { nr: "UP-2026-0006", vor1: "Katrin", nach1: "Albrecht", phase: "selbstauskunft_laeuft", status: "vermittlerpruefung_erforderlich", quelle: "manuell", kaufpreis: 275000, eigenkapital: 55000, darlehen: 240000, nettoeinkommen: 3100, tageInPhase: 12 },
  { nr: "UP-2026-0007", vor1: "Jan", nach1: "Petersen", vor2: "Svenja", nach2: "Petersen", phase: "finanzierungsvorschlag", status: "einreichungsfertig", quelle: "immoscout24", kaufpreis: 540000, eigenkapital: 120000, darlehen: 455000, nettoeinkommen: 7200, tageInPhase: 3 },
  { nr: "UP-2026-0008", vor1: "Fatma", nach1: "Yildiz", phase: "kreditpruefung_eingereicht", status: "uebertragen", quelle: "baufi24", kaufpreis: 430000, eigenkapital: 95000, darlehen: 370000, nettoeinkommen: 4900, tageInPhase: 8 },
  { nr: "UP-2026-0009", vor1: "Markus", nach1: "Brandt", vor2: "Julia", nach2: "Brandt", phase: "zusage", status: "abgeschlossen", quelle: "immoscout24", kaufpreis: 520000, eigenkapital: 160000, darlehen: 400000, nettoeinkommen: 8100, tageInPhase: 4 },
  { nr: "UP-2026-0010", vor1: "Nora", nach1: "Wenzel", phase: "abgeschlossen", status: "abgeschlossen", quelle: "manuell", kaufpreis: 350000, eigenkapital: 105000, darlehen: 260000, nettoeinkommen: 4200, tageInPhase: 20 },
  { nr: "UP-2026-0011", vor1: "Patrick", nach1: "Heller", phase: "anfrage_erstellt", status: "upload_offen", quelle: "vergleich_de", kaufpreis: 290000, eigenkapital: 0, darlehen: 310000, nettoeinkommen: 2500, tageInPhase: 9, verloren: "Kunde hat bei der Hausbank abgeschlossen" },
];

async function main() {
  // Harte Sperre gegen PROD: Die Prisma-CLI liest .env, und dort steht die
  // Produktiv-Supabase. Dieses Skript läuft ausschließlich gegen localhost.
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error("Abbruch: DATABASE_URL zeigt nicht auf localhost – Demo-Fälle nur in die lokale DB.");
  }

  const org = await prisma.organization.findFirstOrThrow();
  const broker = await prisma.user.findFirstOrThrow({ where: { organizationId: org.id } });

  for (const f of faelle) {
    const seit = new Date(Date.now() - f.tageInPhase * 24 * 60 * 60 * 1000);
    await prisma.case.create({
      data: {
        organizationId: org.id,
        caseNumber: f.nr,
        brokerId: broker.id,
        status: f.status,
        leadPhase: f.phase,
        leadPhaseSeit: seit,
        createdAt: new Date(seit.getTime() - 3 * 24 * 60 * 60 * 1000),
        quelle: f.quelle,
        verlorenAm: f.verloren ? new Date() : null,
        verlorenGrund: f.verloren ?? null,
        erstgespraechGefuehrtAm: ["finanzierungsvorschlag", "kreditpruefung_eingereicht", "zusage", "abgeschlossen"].includes(f.phase) ? seit : null,
        abschlussBank: f.phase === "abgeschlossen" || f.phase === "zusage" ? "ING-DiBa" : null,
        darlehensbetrag: f.phase === "abgeschlossen" || f.phase === "zusage" ? f.darlehen : null,
        courtageProzent: f.phase === "abgeschlossen" || f.phase === "zusage" ? 1.5 : null,
        abschlussdatum: f.phase === "abgeschlossen" ? new Date() : null,
        applicants: {
          create: [
            { position: 1, vorname: f.vor1, nachname: f.nach1, phone: "0171 5550000", email: `${f.vor1.toLowerCase()}@example.de` },
            ...(f.vor2 ? [{ position: 2, vorname: f.vor2, nachname: f.nach2! }] : []),
          ],
        },
        financingRequest: {
          create: {
            kaufpreis: f.kaufpreis,
            eigenkapital: f.eigenkapital,
            darlehenswunsch: f.darlehen,
          },
        },
      },
    });
    console.log(`angelegt: ${f.nr} ${f.nach1} (${f.phase})`);
  }
}

main().finally(() => prisma.$disconnect());
