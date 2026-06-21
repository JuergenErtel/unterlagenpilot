import Link from "next/link";
import {
  Download,
  Plus,
  Link2,
  PlayCircle,
  Inbox,
  UploadCloud,
  ScanSearch,
  FileWarning,
  Building2,
  Timer,
} from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { getDashboardData } from "@/lib/cases/dashboard";
import { getSystemStatus } from "@/lib/system/status";
import { PilotBanner } from "@/components/system/system-status-panel";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { TodoCaseCard } from "@/components/dashboard/todo-case-card";
import { Pipeline } from "@/components/case/pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function greeting() {
  return "Guten Tag"; // zeitneutral & deterministisch (kein Date im Render-Cache)
}

export default async function DashboardPage() {
  const ctx = await requireContext();
  const data = await getDashboardData(ctx.organizationId);
  const status = await getSystemStatus(ctx.organizationId);
  const demoCase = await prisma.case.findFirst({
    where: { organizationId: ctx.organizationId, caseNumber: "UP-2026-0001" },
    select: { id: true },
  });

  const hours = Math.floor(data.kpis.zeitersparnisMin / 60);
  const mins = data.kpis.zeitersparnisMin % 60;
  const timeSaved = hours > 0 ? `${hours} h ${mins} min` : `${mins} min`;

  return (
    <div className="space-y-7">
      {status.pilot && <PilotBanner pilot={status.pilot} />}

      {/* Hero */}
      <div className="rounded-xl border bg-card p-6 shadow-soft">
        <PageHeader
          eyebrow="Arbeitszentrale"
          title={`${greeting()}, ${ctx.userName.split(" ")[0]}. Diese Fälle brauchen deine Aufmerksamkeit.`}
          subtitle="Unterlagen prüfen, Lücken schließen und Fälle einreichungsfertig machen."
          actions={
            <>
              <Button asChild>
                <Link href="/cases/import"><Download />Aus FinLink importieren</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/cases/new"><Plus />Neuen Fall anlegen</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/cases"><Link2 />Upload-Link erstellen</Link>
              </Button>
              {demoCase && (
                <Button asChild variant="ghost">
                  <Link href={`/cases/${demoCase.id}`}><PlayCircle />Demo-Fall öffnen</Link>
                </Button>
              )}
            </>
          }
        />
      </div>

      {/* 1) Priorisierte To-do-Liste */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Heute dran</h2>
          <Button asChild variant="link" size="sm"><Link href="/cases">Alle Fälle ansehen</Link></Button>
        </div>
        <div className="space-y-3">
          {data.todos.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <p className="text-sm font-medium">Nichts Dringendes offen.</p>
                <p className="mt-1 text-sm text-muted-foreground">Importiere einen Fall aus FinLink oder lege einen neuen an, um loszulegen.</p>
              </CardContent>
            </Card>
          ) : (
            data.todos.map((t) => <TodoCaseCard key={t.caseId} item={t} />)
          )}
        </div>
      </div>

      {/* 2) Mini-Pipeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fall-Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <Pipeline stages={data.pipeline} />
        </CardContent>
      </Card>

      {/* 3) KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Offene Fälle" value={data.kpis.offen} icon={Inbox} href="/cases" />
        <MetricCard label="Neue Uploads" value={data.kpis.neueUploads} tone="ai" icon={UploadCloud} href="/review" />
        <MetricCard label="Prüfbereite KI-Auswertungen" value={data.kpis.pruefbereit} tone="ai" icon={ScanSearch} href="/review" />
        <MetricCard label="Fehlende Unterlagen" value={data.kpis.unterlagenFehlen} tone="review" icon={FileWarning} href="/cases?status=unterlagen_fehlen" />
        <MetricCard label="Bereit für Europace" value={data.kpis.bereitEuropace} tone={data.kpis.bereitEuropace > 0 ? "ready" : "neutral"} icon={Building2} />
        <MetricCard label="Bereit für FinLink" value={data.kpis.bereitFinlink} tone={data.kpis.bereitFinlink > 0 ? "ready" : "neutral"} icon={Building2} />
        <MetricCard label="Bereit für eHyp home" value={data.kpis.bereitEhyp} tone={data.kpis.bereitEhyp > 0 ? "ready" : "neutral"} icon={Building2} />
        <MetricCard label="Zeitersparnis diese Woche" value={timeSaved} tone="ready" icon={Timer} hint="geschätzt, KI-gestützt" />
      </div>
    </div>
  );
}
