import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { syncFinLinkLeads } from "@/lib/platforms/finlink/sync";
import { timingSafeEqualStrings } from "@/lib/security/timing-safe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Holt alle 15 Minuten neue FinLink-Leads und legt daraus Fälle an.
 *
 * Absicherung wie bei den übrigen Cron-Routen: nur mit gesetztem CRON_SECRET
 * und passendem Bearer-Header (Vercel-Cron liefert ihn automatisch).
 */
export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!env.CRON_SECRET) {
    return NextResponse.json({ ok: false, reason: "CRON_SECRET nicht gesetzt" }, { status: 503 });
  }
  if (!timingSafeEqualStrings(req.headers.get("authorization") ?? "", `Bearer ${env.CRON_SECRET}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let angelegt = 0;
  let fehler = 0;

  for (const org of orgs) {
    try {
      // Der Lauf gehört keinem Menschen – der Fall aber schon: Ohne Betreuer
      // taucht er in keiner persönlichen Liste auf. Deshalb der erste aktive
      // Vermittler der Organisation; gibt es keinen, bleibt das Feld leer.
      const betreuer = await prisma.user.findFirst({
        where: { organizationId: org.id, active: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const r = await syncFinLinkLeads({ organizationId: org.id, userId: betreuer?.id ?? "" });
      angelegt += r.angelegt;
      if (r.status === "fehler") fehler += 1;
    } catch (e) {
      // Eine kaputte Organisation darf die anderen nicht mitreißen.
      console.error(`[finlink-cron] Organisation ${org.id} fehlgeschlagen:`, e);
      fehler += 1;
    }
  }

  return NextResponse.json({ ok: true, organisationen: orgs.length, angelegt, fehler });
}
