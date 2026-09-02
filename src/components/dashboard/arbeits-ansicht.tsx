import Link from "next/link";
import { Plus, PlayCircle, ListTodo } from "lucide-react";
import { getDashboardData } from "@/lib/cases/dashboard";
import { prisma } from "@/lib/db";
import { nurVertrieb } from "@/lib/cases/aktenart";
import { Button } from "@/components/ui/button";
import { Kennzahlenband } from "@/components/dashboard/kennzahlenband";
import { Pipeline } from "@/components/case/pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Die Arbeitssicht der Arbeitszentrale: Statustrichter und Kennzahlenband.
 *
 * Bis zum 12.08.2026 war das die gesamte Dashboard-Seite; seither liegt sie
 * unter `?ansicht=tabelle` neben dem Board. Seit dem 16.08.2026 zeigt sie
 * keine Aufgaben mehr – die stehen unter /heute.
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
    prisma.case.count({ where: { organizationId, ...nurVertrieb } }),
  ]);

  const hours = Math.floor(data.kpis.zeitersparnisMin / 60);
  const mins = data.kpis.zeitersparnisMin % 60;
  const timeSaved = hours > 0 ? `${hours} h ${mins} min` : `${mins} min`;

  // Unterscheidet "noch nie einen Fall angelegt" von "alles erledigt" – die
  // Pipeline taugt dafür nicht, weil abgeschlossene Fälle dort nicht auftauchen.
  const keineFaelle = caseCount === 0;

  return (
    <>
      {/*
        Erstnutzung: der leere Zustand muss sagen, WAS zu tun ist.

        Die beiden Abschnitte "Heute dran" und "Heute faellig", die hier bis
        zum 16.08.2026 standen, sind nach /heute UMGEZOGEN. Sie beantworteten
        dieselbe Frage in zwei Listen – ein Fall mit ueberfaelliger
        Wiedervorlage stand in beiden –, waren bei sechs Eintraegen gedeckelt
        und nach nichts sortiert, was mit Dringlichkeit zu tun hatte. Wer sie
        hier wieder einbaut, hat sie zum zweiten Mal.
      */}
      {keineFaelle ? (
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
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm">
            <ListTodo className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>Was heute zu tun ist, steht in der Tagesliste – nach Dringlichkeit sortiert.</span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/heute">Zur Tagesliste</Link>
          </Button>
        </div>
      )}

      {/* 2) Statustrichter. NICHT "Pipeline" nennen: Das Board zeigt die
          Vertriebsphasen, dieser Trichter den Stand der UNTERLAGEN – zwei
          verschiedene Fragen, die unter demselben Namen niemand
          auseinanderhalten kann. */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="eyebrow">Unterlagen-Status</CardTitle>
          <p className="text-xs font-normal normal-case tracking-normal text-muted-foreground">
            Wo die Unterlagen jedes Falls stehen – die Vertriebsphasen zeigt das Board.
          </p>
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
              { label: "Dokumente im Review-Center", wert: data.kpis.pruefbereit, href: "/review" },
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
