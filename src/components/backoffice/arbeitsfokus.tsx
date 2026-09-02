import Link from "next/link";
import { ArrowRight, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuftragZeile } from "@/lib/backoffice/auftraege";
import { naechsteHandlung } from "@/lib/backoffice/fokus";
import { auftragsartLabel } from "@/lib/backoffice/leistungen";
import { datumZeitText } from "@/lib/backoffice/anzeige";
import { FristMarke, PrioritaetMarke, StatusMarke } from "./status-anzeigen";

/**
 * Der Arbeitsfokus: EIN Auftrag, EINE Handlung. Steht ganz oben auf dem
 * Dashboard und in "Jetzt bearbeiten" - niemand muss Themenlisten
 * durchgehen, um zu wissen, was als Naechstes dran ist.
 */
export function Arbeitsfokus({ auftrag, jetzt, weitere }: { auftrag: AuftragZeile; jetzt: Date; weitere: number }) {
  const h = naechsteHandlung(auftrag);
  const ziel =
    h.ziel === "unterlagen"
      ? `/cases/${auftrag.caseId}/unterlagen`
      : h.ziel === "review"
        ? `/review?case=${auftrag.caseId}`
        : `/backoffice/auftraege/${auftrag.id}`;
  return (
    <section aria-labelledby="fokus-titel" className="flaeche-oben overflow-hidden">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="eyebrow" id="fokus-titel">Jetzt dran</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/backoffice/auftraege/${auftrag.id}`} className="t-abschnitt text-lg hover:underline">
              {auftrag.aktenbezeichnung}
            </Link>
            <span className="font-mono text-sm tabular text-muted-foreground">{auftrag.auftragsnummer}</span>
            <PrioritaetMarke prioritaet={auftrag.prioritaet} />
          </div>
          <p className="text-[0.95rem] font-medium text-foreground">{h.text}</p>
          <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><dt className="sr-only">Auftraggeber</dt><dd>{auftrag.auftraggeberName}</dd></div>
            <div className="flex items-center gap-1.5"><dt className="sr-only">Auftragsart</dt><dd>{auftragsartLabel(auftrag.auftragsart)}</dd></div>
            <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">Bearbeiter</dt><dd>{auftrag.bearbeiterName ?? "nicht zugewiesen"}</dd></div>
            <div className="flex items-center gap-1.5"><dt className="sr-only">Frist</dt><dd><FristMarke faelligAm={auftrag.faelligAm} status={auftrag.status} pausiert={Boolean(auftrag.pausiertSeit)} jetzt={jetzt} /></dd></div>
            <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">Letzte Aktivität</dt><dd>{datumZeitText(auftrag.updatedAt)}</dd></div>
            <div className="flex items-center gap-1.5"><dt className="sr-only">Status</dt><dd><StatusMarke status={auftrag.status} pausiert={Boolean(auftrag.pausiertSeit)} /></dd></div>
          </dl>
          {h.blocker && <p className="text-xs font-medium text-[hsl(var(--warning))]">Blocker: {h.blocker}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
          <Button asChild>
            <Link href={ziel}>
              {h.text.length > 34 ? "Öffnen" : h.text} <ArrowRight aria-hidden />
            </Link>
          </Button>
          {weitere > 0 && (
            <Link href="/backoffice/queue" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              {weitere === 1 ? "1 weiterer Auftrag wartet" : `${weitere} weitere Aufträge warten`}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
