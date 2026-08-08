import Link from "next/link";
import { Download, Plus, PlayCircle, CalendarClock } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { getDashboardData } from "@/lib/cases/dashboard";
import { getSystemStatus } from "@/lib/system/status";
import { PilotBanner } from "@/components/system/system-status-panel";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Kennzahlenband } from "@/components/dashboard/kennzahlenband";
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

      {/* Kopf – ohne Karte darum: die Ueberschrift steht auf dem Papier, nicht
          in einem zweiten Rahmen. */}
      <PageHeader
          eyebrow="Arbeitszentrale"
          title={`${greeting()}, ${ctx.userName.split(" ")[0]}. Diese Fälle brauchen deine Aufmerksamkeit.`}
          subtitle="Unterlagen prüfen, Lücken schließen und Fälle einreichungsfertig machen."
          actions={
            <>
              <Button asChild>
                <Link href="/cases/new"><Plus />Neuen Fall anlegen</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/cases/import">
                  <Download />Aus FinLink importieren
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

      {/* 1) Priorisierte To-do-Liste */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="eyebrow">Heute dran</h2>
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
        <CardHeader className="pb-4">
          <CardTitle className="eyebrow">Fall-Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <Pipeline stages={data.pipeline} />
        </CardContent>
      </Card>

      {/* 3) Kennzahlen entlang des Wegs, den eine Akte nimmt */}
      <Kennzahlenband
        abschnitte={[
          {
            titel: "Eingang",
            zeilen: [
              { label: "Neue Leads (7 Tage)", wert: data.kpis.neueLeads, href: "/pipeline" },
              { label: "Neue Uploads", wert: data.kpis.neueUploads, href: "/review" },
              { label: "Offene Fälle", wert: data.kpis.offen, href: "/cases" },
            ],
          },
          {
            titel: "Prüfung",
            zeilen: [
              { label: "Prüfbereite KI-Auswertungen", wert: data.kpis.pruefbereit, href: "/review" },
              {
                label: "Fehlende Unterlagen",
                wert: data.kpis.unterlagenFehlen,
                href: "/cases?status=unterlagen_fehlen",
                betont: true,
              },
              {
                label: "Zeitersparnis diese Woche",
                wert: timeSaved,
                hinweis: "Schätzung: 8 Min. je KI-ausgewertetem Dokument",
              },
            ],
          },
          {
            titel: "Einreichung",
            zeilen: [
              { label: "Bereit für Europace", wert: data.kpis.bereitEuropace, href: "/cases?status=einreichungsfertig" },
              { label: "Bereit für FinLink", wert: data.kpis.bereitFinlink, href: "/cases?status=einreichungsfertig" },
              { label: "Bereit für eHyp home", wert: data.kpis.bereitEhyp, href: "/cases?status=einreichungsfertig" },
            ],
          },
        ]}
      />
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
