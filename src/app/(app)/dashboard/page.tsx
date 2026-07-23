import Link from "next/link";
import {
  Download,
  Plus,
  PlayCircle,
  Inbox,
  UploadCloud,
  ScanSearch,
  FileWarning,
  Building2,
  Timer,
  CalendarClock,
} from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { getDashboardData } from "@/lib/cases/dashboard";
import { getSystemStatus } from "@/lib/system/status";
import { PilotBanner } from "@/components/system/system-status-panel";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  // Die vier Datenquellen sind voneinander unabhängig. Parallel geladen, damit
  // die DB-Verbindung möglichst kurz gehalten wird (unter Fluid Compute teilen
  // sich gleichzeitige Requests denselben Pool – lange Haltezeiten führten zu
  // "Timed out fetching a new connection from the connection pool").
  const [data, status, demoCase, caseCount] = await Promise.all([
    getDashboardData(ctx.organizationId),
    getSystemStatus(ctx.organizationId),
    prisma.case.findFirst({
      where: { organizationId: ctx.organizationId, caseNumber: "UP-2026-0001" },
      select: { id: true },
    }),
    prisma.case.count({ where: { organizationId: ctx.organizationId } }),
  ]);

  const hours = Math.floor(data.kpis.zeitersparnisMin / 60);
  const mins = data.kpis.zeitersparnisMin % 60;
  const timeSaved = hours > 0 ? `${hours} h ${mins} min` : `${mins} min`;

  // Unterscheidet "noch nie einen Fall angelegt" von "alles erledigt" – die
  // Pipeline taugt dafür nicht, weil abgeschlossene Fälle dort nicht auftauchen.
  const keineFaelle = caseCount === 0;

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
              {/* Primäraktion ist der Weg, der wirklich funktioniert. Der
                  FinLink-Import ist bislang ein Stub – als Hauptbutton führte er
                  den Nutzer in eine Sackgasse. */}
              <Button asChild>
                <Link href="/cases/new"><Plus />Neuen Fall anlegen</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/cases/import">
                  <Download />Aus FinLink importieren
                  <Badge variant="neutral" className="ml-1">bald</Badge>
                </Link>
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
          {data.todos.length === 0 && keineFaelle ? (
            // Erstnutzung: der leere Zustand muss sagen, WAS zu tun ist.
            <Card>
              <CardContent className="space-y-4 p-8">
                <div className="text-center">
                  <p className="text-base font-semibold">Willkommen bei BaufiDesk.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    In drei Schritten ist Ihr erster Fall bankfertig.
                  </p>
                </div>
                <ol className="mx-auto grid max-w-lg gap-3 text-sm">
                  <OnboardingStep n={1} title="Fall anlegen" text="Name und Finanzierungsart genügen – alles Weitere ergänzt die KI aus den Unterlagen." />
                  <OnboardingStep n={2} title="Upload-Link an den Kunden senden" text="Im Fall unter „Sicherer Upload-Link“. Der Kunde lädt ohne Login hoch." />
                  <OnboardingStep n={3} title="Prüfen und exportieren" text="KI-Prüfung starten, Vorschläge bestätigen, Paket für die Bank erzeugen." />
                </ol>
                <div className="flex justify-center gap-2 pt-1">
                  <Button asChild><Link href="/cases/new"><Plus />Ersten Fall anlegen</Link></Button>
                  {demoCase && (
                    <Button asChild variant="outline">
                      <Link href={`/cases/${demoCase.id}`}><PlayCircle />Demo-Fall ansehen</Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : data.todos.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <p className="text-sm font-medium">Nichts Dringendes offen.</p>
                <p className="mt-1 text-sm text-muted-foreground">Alle aktiven Fälle sind auf Kurs. Neuen Fall anlegen, um loszulegen.</p>
              </CardContent>
            </Card>
          ) : (
            data.todos.map((t) => <TodoCaseCard key={t.caseId} item={t} />)
          )}
        </div>
      </div>

      {/* Wiedervorlagen / Fristen / Bank-Nachforderungen */}
      {data.followups.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" /> Heute fällig
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.followups.map((f) => (
              <Link
                key={`${f.caseId}-${f.grund}`}
                href={`/cases/${f.caseId}/verwaltung`}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-accent"
              >
                <div>
                  <span className="font-medium">{f.kundenName}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{f.caseNumber}</span>
                  {/* Ein stabiler <span> je Grund – React manipuliert nie rohe
                      Textknoten-Geschwister, die ein Auto-Übersetzer wegziehen
                      könnte (parentNode-Crash). */}
                  <div className="text-xs text-muted-foreground">
                    {f.grund === "wiedervorlage" && <span>Wiedervorlage fällig</span>}
                    {f.grund === "frist" && <span>Frist: {f.naechsteFrist?.title ?? "—"}</span>}
                    {f.grund === "bank_nachforderung" && <span>{f.offeneBankforderungen} offene Bank-Nachforderung(en)</span>}
                  </div>
                </div>
                {f.faelligAm && (
                  <Badge variant={f.faelligAm < new Date() ? "warning" : "neutral"}>
                    {f.faelligAm.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </Badge>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

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
        <MetricCard label="Bereit für Europace" value={data.kpis.bereitEuropace} tone={data.kpis.bereitEuropace > 0 ? "ready" : "neutral"} icon={Building2} href="/cases?status=einreichungsfertig" />
        <MetricCard label="Bereit für FinLink" value={data.kpis.bereitFinlink} tone={data.kpis.bereitFinlink > 0 ? "ready" : "neutral"} icon={Building2} href="/cases?status=einreichungsfertig" />
        <MetricCard label="Bereit für eHyp home" value={data.kpis.bereitEhyp} tone={data.kpis.bereitEhyp > 0 ? "ready" : "neutral"} icon={Building2} href="/cases?status=einreichungsfertig" />
        <MetricCard
          label="Zeitersparnis diese Woche"
          value={timeSaved}
          tone="ready"
          icon={Timer}
          hint="Schätzung: 8 Min. je KI-ausgewertetem Dokument"
        />
      </div>
    </div>
  );
}

function OnboardingStep({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-muted-foreground">{text}</span>
      </span>
    </li>
  );
}
