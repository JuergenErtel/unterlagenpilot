import Link from "next/link";
import { Plus, PlayCircle, CalendarClock } from "lucide-react";
import { getDashboardData } from "@/lib/cases/dashboard";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kennzahlenband } from "@/components/dashboard/kennzahlenband";
import { TodoCaseCard } from "@/components/dashboard/todo-case-card";
import { Pipeline } from "@/components/case/pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Die Arbeitssicht der Arbeitszentrale: priorisierte To-dos, heute Fälliges,
 * der Statustrichter und das Kennzahlenband.
 *
 * Bis zum 12.08.2026 war das die gesamte Dashboard-Seite; seither liegt sie
 * unter `?ansicht=tabelle` neben dem Board.
 */
export async function ArbeitsAnsicht({
  organizationId,
  demoCaseId,
}: {
  organizationId: string;
  demoCaseId: string | null;
}) {
  const [data, caseCount] = await Promise.all([
    getDashboardData(organizationId),
    prisma.case.count({ where: { organizationId } }),
  ]);

  const hours = Math.floor(data.kpis.zeitersparnisMin / 60);
  const mins = data.kpis.zeitersparnisMin % 60;
  const timeSaved = hours > 0 ? `${hours} h ${mins} min` : `${mins} min`;

  // Unterscheidet "noch nie einen Fall angelegt" von "alles erledigt" – die
  // Pipeline taugt dafür nicht, weil abgeschlossene Fälle dort nicht auftauchen.
  const keineFaelle = caseCount === 0;

  return (
    <>
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
                  {demoCaseId && (
                    <Button asChild variant="outline">
                      <Link href={`/cases/${demoCaseId}`}><PlayCircle />Demo-Fall ansehen</Link>
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

      {/* 2) Statustrichter */}
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
              { label: "Neue Leads (7 Tage)", wert: data.kpis.neueLeads, href: "/dashboard" },
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
    </>
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
