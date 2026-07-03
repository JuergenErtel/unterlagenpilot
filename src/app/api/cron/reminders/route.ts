import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { getCaseAggregate } from "@/lib/cases/service";
import { sendEmail, isEmailConfigured } from "@/lib/email/resend";
import { buildReminderDigest } from "@/lib/cases/reminder-digest";
import {
  selectOverdueCases,
  OPEN_STATUSES_LIST,
  type ReminderCase,
} from "@/lib/cases/reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Täglicher Wiedervorlage-Cron: findet überfällige Fälle (offene Unterlagen,
 * aktiver Upload-Link, seit N Tagen keine Kundenaktivität) und schickt jedem
 * Vermittler eine Digest-E-Mail mit Direktlinks. Sendet NIE automatisch an Kunden.
 *
 * Absicherung: läuft nur mit gesetztem CRON_SECRET und passendem Bearer-Header
 * (Vercel-Cron liefert ihn automatisch). `?dryRun=1` berechnet ohne zu senden.
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
  const threshold = env.REMINDER_AFTER_DAYS;

  // Kandidaten: nur offene Fälle mit aktivem, gültigem Upload-Link.
  const candidates = await prisma.case.findMany({
    where: {
      status: { in: [...OPEN_STATUSES_LIST] },
      uploadLinks: { some: { active: true, expiresAt: { gt: now } } },
    },
    select: {
      id: true,
      caseNumber: true,
      status: true,
      organizationId: true,
      applicants: { orderBy: { position: "asc" }, select: { vorname: true, nachname: true } },
      uploadLinks: {
        where: { active: true, expiresAt: { gt: now } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      },
      documents: {
        where: { uploadSource: "kunde" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
    take: 500,
  });

  // Pro Fall die Fälligkeits-Eingabe bauen (missingCount aus dem Aggregat).
  const byOrg = new Map<string, ReminderCase[]>();
  for (const c of candidates) {
    let missingCount = 0;
    try {
      missingCount = (await getCaseAggregate(c.id)).missing.length;
    } catch {
      continue; // defekten Fall überspringen, Cron nicht abbrechen
    }
    const lastCustomerActivityAt =
      c.documents[0]?.createdAt ?? c.uploadLinks[0]?.createdAt ?? null;
    const kundenName =
      c.applicants
        .map((a) => [a.vorname, a.nachname].filter(Boolean).join(" "))
        .filter(Boolean)
        .join(", ") || c.caseNumber;

    const item: ReminderCase = {
      caseId: c.id,
      caseNumber: c.caseNumber,
      status: c.status,
      hasActiveLink: c.uploadLinks.length > 0,
      lastCustomerActivityAt,
      kundenName,
      missingCount,
    };
    const list = byOrg.get(c.organizationId) ?? [];
    list.push(item);
    byOrg.set(c.organizationId, list);
  }

  const emailReady = isEmailConfigured();
  let orgsWithOverdue = 0;
  let overdueTotal = 0;
  let emailsSent = 0;
  const summary: Array<{ organizationId: string; overdue: number; recipients: string[] }> = [];

  for (const [organizationId, cases] of byOrg) {
    const overdue = selectOverdueCases(cases, now, threshold);
    if (overdue.length === 0) continue;
    orgsWithOverdue += 1;
    overdueTotal += overdue.length;

    const brokers = await prisma.user.findMany({
      where: { organizationId, active: true, email: { contains: "@" } },
      select: { name: true, email: true },
    });
    const recipients = brokers.map((b) => b.email);
    summary.push({ organizationId, overdue: overdue.length, recipients });

    if (dryRun || !emailReady) continue;

    for (const broker of brokers) {
      const firstName = broker.name.split(" ")[0] || broker.name;
      const digest = buildReminderDigest(firstName, overdue, env.APP_BASE_URL);
      try {
        await sendEmail({ to: broker.email, subject: digest.subject, text: digest.text });
        emailsSent += 1;
      } catch (e) {
        console.error(`[cron/reminders] Digest an ${broker.email} fehlgeschlagen:`, e);
      }
    }

    await audit({
      organizationId,
      userId: null,
      action: "message.sent",
      entityType: "organization",
      entityId: organizationId,
      metadata: { feature: "wiedervorlage_digest", overdue: overdue.length },
    });
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    emailConfigured: emailReady,
    thresholdDays: threshold,
    candidates: candidates.length,
    orgsWithOverdue,
    overdueTotal,
    emailsSent,
    summary,
  });
}
