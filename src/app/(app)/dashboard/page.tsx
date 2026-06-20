import Link from "next/link";
import {
  Inbox,
  UploadCloud,
  ScanSearch,
  FileWarning,
  Building2,
  AlertTriangle,
  Plus,
  Link2,
  Send,
} from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { getDashboardBuckets } from "@/lib/cases/service";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CaseStatusBadge } from "@/components/status-badge";
import { ReadinessMeter } from "@/components/readiness-meter";
import { computeReadiness } from "@/lib/documents/readiness";
import type { CaseStatus } from "@/lib/domain/enums";

export default async function DashboardPage() {
  const ctx = await requireContext();
  const buckets = await getDashboardBuckets(ctx.organizationId);
  const recent = await prisma.case.findMany({
    where: { organizationId: ctx.organizationId },
    include: { applicants: true },
    orderBy: { updatedAt: "desc" },
    take: 6,
  });

  const tiles: Array<{ label: string; value: number; href: string; icon: React.ElementType; tone?: string }> = [
    { label: "Offene Fälle", value: buckets.offen, href: "/cases", icon: Inbox },
    { label: "Neue Uploads", value: buckets.neueUploads, href: "/review", icon: UploadCloud },
    { label: "Prüfbereite KI-Auswertungen", value: buckets.pruefbereit, href: "/review", icon: ScanSearch },
    { label: "Unterlagen fehlen", value: buckets.unterlagenFehlen, href: "/cases?status=unterlagen_fehlen", icon: FileWarning, tone: "text-warning" },
    { label: "Bankbezogene Nachforderungen", value: buckets.bankNachforderung, href: "/cases", icon: Building2 },
    { label: "Bereit für Europace", value: buckets.bereitEuropace, href: "/cases", icon: Building2, tone: "text-success" },
    { label: "Bereit für FinLink", value: buckets.bereitFinlink, href: "/cases", icon: Building2, tone: "text-success" },
    { label: "Bereit für eHyp home", value: buckets.bereitEhyp, href: "/cases", icon: Building2, tone: "text-success" },
    { label: "Export-/Übertragungsprobleme", value: buckets.exportprobleme, href: "/cases", icon: AlertTriangle, tone: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Willkommen zurück, {ctx.userName}. Was möchtest du als Nächstes tun?
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm"><Link href="/cases/new"><Plus />Neuer Fall</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/cases/import">Aus FinLink importieren</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/cases"><Link2 />Upload-Link erstellen</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/messages"><Send />Nachforderung erstellen</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className={`text-3xl font-semibold tabular-nums ${t.tone ?? ""}`}>{t.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{t.label}</div>
                </div>
                <t.icon className={`h-6 w-6 ${t.tone ?? "text-muted-foreground"}`} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Zuletzt bearbeitete Fälle</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {recent.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Fälle. Lege deinen ersten Fall an oder führe das Seed-Skript aus.
            </p>
          )}
          {recent.map((c) => {
            const r = computeReadiness({ checklist: [] });
            r.score = c.readinessScore;
            return (
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-accent/40"
              >
                <div>
                  <div className="font-medium">
                    {c.caseNumber} · {c.applicants.map((a) => [a.vorname, a.nachname].filter(Boolean).join(" ")).join(", ") || "Ohne Namen"}
                  </div>
                  <div className="text-xs text-muted-foreground">Einreichungsstatus {c.readinessScore} %</div>
                </div>
                <CaseStatusBadge status={c.status as CaseStatus} />
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
