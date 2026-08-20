import Link from "next/link";
import { Download, Plus, PlayCircle } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { getSystemStatus } from "@/lib/system/status";
import { PilotBanner } from "@/components/system/system-status-panel";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { AnsichtUmschalter, type DashboardAnsicht } from "@/components/dashboard/ansicht-umschalter";
import { BoardAnsicht } from "@/components/dashboard/board-ansicht";
import { ArbeitsAnsicht } from "@/components/dashboard/arbeits-ansicht";

export const dynamic = "force-dynamic";

function greeting() {
  return "Guten Tag"; // zeitneutral & deterministisch (kein Date im Render-Cache)
}

/**
 * Die Arbeitszentrale mit zwei Sichten.
 *
 * Seit dem 12.08.2026 ist das Board (Leadphasen-Kanban, vormals /pipeline) der
 * Standard: Der Arbeitstag beginnt an der Pipeline, nicht an einer Kennzahl.
 * Die frühere Dashboard-Ansicht – To-dos, Fristen, Kennzahlen – liegt unter
 * `?ansicht=tabelle` und ist über den Umschalter im Kopf erreichbar.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string }>;
}) {
  const ctx = await requireContext();
  const { ansicht } = await searchParams;
  // Alles außer dem ausdrücklichen "tabelle" landet auf dem Board – ein
  // vertippter Parameter darf keine leere Seite erzeugen.
  const aktiv: DashboardAnsicht = ansicht === "tabelle" ? "tabelle" : "board";

  const [status, demoCase] = await Promise.all([
    getSystemStatus(ctx.organizationId),
    prisma.case.findFirst({
      where: { organizationId: ctx.organizationId, caseNumber: "UP-2026-0001" },
      select: { id: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      {status.pilot && <PilotBanner pilot={status.pilot} />}

      {/*
        Der Kopf ist bewusst EINE Zeile Gruß plus Aktionen: Die Arbeit auf
        dieser Seite ist das Board, und das gehört über die Falz. Die frühere
        zweizeilige Begrüßung samt Untertitel schob es unter den Bildschirmrand.
      */}
      <PageHeader
        className="pb-4"
        eyebrow="Arbeitszentrale"
        title={`${greeting()}, ${ctx.userName.split(" ")[0]}.`}
        subtitle={
          aktiv === "board"
            ? undefined
            : "Statustrichter und Kennzahlen über alle Fälle – die Aufgaben stehen in der Tagesliste."
        }
        actions={
          <>
            <AnsichtUmschalter aktiv={aktiv} />
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

      {aktiv === "board" ? (
        <BoardAnsicht organizationId={ctx.organizationId} />
      ) : (
        <ArbeitsAnsicht organizationId={ctx.organizationId} demoCaseId={demoCase?.id ?? null} />
      )}
    </div>
  );
}
