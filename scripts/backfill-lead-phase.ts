/**
 * Setzt die Vertriebsphase aller vorhandenen Fälle – einmalig.
 *
 * Benutzt bewusst DIESELBE Vorschlagsfunktion wie der laufende Betrieb, damit es
 * keine zweite Zuordnung gibt, die anders altert als die Regel.
 *
 * Aufruf: npx tsx --env-file=.env scripts/backfill-lead-phase.ts
 */
import { PrismaClient } from "@prisma/client";
import { schlagePhaseVor } from "../src/lib/cases/lead-phase";

export async function backfillLeadPhase(
  prisma: PrismaClient
): Promise<{ gesetzt: number; geprueft: number }> {
  const faelle = await prisma.case.findMany({
    select: {
      id: true,
      status: true,
      leadPhase: true,
      verlorenAm: true,
      abschlussdatum: true,
      updatedAt: true,
      _count: { select: { documents: true, uploadLinks: true, selfDisclosureLinks: true } },
      generatedMessages: { where: { sent: true }, select: { id: true }, take: 1 },
      selfDisclosures: { select: { currentStep: true }, take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  let gesetzt = 0;
  for (const c of faelle) {
    const vorschlag = schlagePhaseVor({
      leadPhase: c.leadPhase,
      verlorenAm: c.verlorenAm,
      status: c.status,
      abschlussdatum: c.abschlussdatum,
      hatLink: c._count.uploadLinks > 0 || c._count.selfDisclosureLinks > 0,
      hatGesendeteNachricht: c.generatedMessages.length > 0,
      selbstauskunftBegonnen: Boolean(c.selfDisclosures[0]?.currentStep),
      dokumenteVorhanden: c._count.documents > 0,
    });
    if (!vorschlag) continue;
    await prisma.case.update({
      where: { id: c.id },
      // leadPhaseSeit auf updatedAt, damit die Liegezeiten nicht alle bei null
      // beginnen und das Board am ersten Tag nicht "alles frisch" behauptet.
      data: { leadPhase: vorschlag, leadPhaseSeit: c.updatedAt },
    });
    gesetzt += 1;
  }
  return { gesetzt, geprueft: faelle.length };
}

if (process.argv[1]?.includes("backfill-lead-phase")) {
  const prisma = new PrismaClient();
  backfillLeadPhase(prisma)
    .then((r) => console.log(`${r.gesetzt} von ${r.geprueft} Fällen gesetzt.`))
    .finally(() => prisma.$disconnect());
}
