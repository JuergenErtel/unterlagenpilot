import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { purgeCase } from "@/lib/cases/purge";
import { selectExpiredCases, type RetentionCase } from "@/lib/cases/retention";

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

  return NextResponse.json({
    ok: true,
    dryRun,
    candidates: candidates.length,
    expired: expired.length,
    deleted,
    cases: expired.map((c) => ({ caseNumber: c.caseNumber, status: c.status, ageDays: c.ageDays, retentionDays: c.retentionDays })),
  });
}
