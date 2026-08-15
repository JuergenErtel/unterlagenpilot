import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { purgeCase } from "@/lib/cases/purge";
import {
  selectExpiredCases,
  selectAbandonedSelfDisclosures,
  type RetentionCase,
} from "@/lib/cases/retention";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Aufbewahrungs-Cron: löscht Fälle, deren organisationsweite Aufbewahrungsfrist
 * (Organization.retentionDays) abgelaufen ist – NUR abgeschlossene/archivierte Fälle.
 *
 * Sehr konservativ + abgesichert:
 *  - läuft nur mit CRON_SECRET + passendem Bearer (Vercel-Cron liefert ihn),
 *  - retentionDays = 0 (Default) => nie automatisch löschen,
 *  - `?dryRun=1` listet, ohne zu löschen.
 */
export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!env.CRON_SECRET) {
    return NextResponse.json({ ok: false, reason: "CRON_SECRET nicht gesetzt" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse("Nicht autorisiert.", { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const now = new Date();

  // Kandidaten: nur terminale Fälle in Organisationen mit gesetzter Frist.
  const candidates = await prisma.case.findMany({
    where: {
      status: { in: ["abgeschlossen", "archiviert"] },
      organization: { retentionDays: { gt: 0 } },
    },
    select: {
      id: true,
      caseNumber: true,
      status: true,
      updatedAt: true,
      organizationId: true,
      organization: { select: { retentionDays: true } },
    },
    take: 1000,
  });

  const items: RetentionCase[] = candidates.map((c) => ({
    caseId: c.id,
    caseNumber: c.caseNumber,
    status: c.status,
    updatedAt: c.updatedAt,
    retentionDays: c.organization.retentionDays,
  }));
  const expired = selectExpiredCases(items, now);

  // Für Zuordnung zur Organisation beim Löschen.
  const orgByCase = new Map(candidates.map((c) => [c.id, c.organizationId]));

  let deleted = 0;
  if (!dryRun) {
    for (const c of expired) {
      const organizationId = orgByCase.get(c.caseId)!;
      try {
        await purgeCase(c.caseId, { organizationId, userId: null, reason: "retention" });
        deleted += 1;
      } catch (e) {
        console.error(`[cron/retention] Löschen von ${c.caseNumber} fehlgeschlagen:`, e);
      }
    }
  }

  // Zweiter Aufräumschritt in demselben Cron (Schlussreview-Befund 6):
  // abgebrochene Anfrageformular-Bögen ohne Fall. Es gibt hier keine Frist,
  // an der eine Organisation drehen könnte – retentionDays greift nicht,
  // sobald der zugehörige Link abgelaufen ist, ist der Bogen tot.
  //
  // Der Ablauf-Filter steht bewusst schon in der Abfrage (nicht erst im
  // JavaScript danach): Bei dauerhaft > 1000 offenen Bögen würde `take: 1000`
  // sonst das Fenster mit noch gültigen Zeilen füllen, und die abgelaufenen
  // kämen nie dran – der Aufräumlauf würde still verhungern. `orderBy` holt
  // die am längsten überfälligen zuerst, falls der Deckel doch mal greift.
  const boegenKandidaten = await prisma.selfDisclosure.findMany({
    where: { caseId: null, link: { expiresAt: { lt: now } } },
    select: { id: true, link: { select: { expiresAt: true } } },
    orderBy: { link: { expiresAt: "asc" } },
    take: 1000,
  });
  const abgebrocheneBoegen = selectAbandonedSelfDisclosures(
    boegenKandidaten.map((b) => ({ id: b.id, linkExpiresAt: b.link.expiresAt })),
    now
  );

  let boegenGeloescht = 0;
  if (!dryRun) {
    for (const b of abgebrocheneBoegen) {
      try {
        await prisma.selfDisclosure.delete({ where: { id: b.id } });
        boegenGeloescht += 1;
      } catch (e) {
        console.error(`[cron/retention] Löschen des abgebrochenen Bogens ${b.id} fehlgeschlagen:`, e);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    candidates: candidates.length,
    expired: expired.length,
    deleted,
    cases: expired.map((c) => ({ caseNumber: c.caseNumber, status: c.status, ageDays: c.ageDays, retentionDays: c.retentionDays })),
    abgebrocheneBoegenKandidaten: boegenKandidaten.length,
    abgebrocheneBoegen: abgebrocheneBoegen.length,
    boegenGeloescht,
  });
}
