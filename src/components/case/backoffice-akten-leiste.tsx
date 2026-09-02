import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import type { BackofficeStatus } from "@/lib/domain/enums";
import { FristMarke, StatusMarke } from "@/components/backoffice/status-anzeigen";

/**
 * Schmale Hinweisleiste ueber der Bereichsleiste: Diese Akte haengt an einem
 * Backoffice-Auftrag. Erscheint nur fuer Nutzer mit Backoffice-Rolle - der
 * Vermittler ohne Rolle sieht seinen Fall unveraendert (die Statuskarte in
 * der Fallakte sagt ihm, was er wissen muss).
 *
 * Server-Komponente: Status- und Fristmarke brauchen keine Hooks.
 */
export function BackofficeAktenLeiste({
  auftragId,
  auftragsnummer,
  status,
  pausiert,
  faelligAm,
  auftraggeberName,
}: {
  auftragId: string;
  auftragsnummer: string;
  status: BackofficeStatus;
  pausiert: boolean;
  faelligAm: Date | null;
  /** Nur bei Backoffice-Akten: wessen Auftrag das ist. */
  auftraggeberName?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-ai/30 bg-ai/[0.05] px-3 py-2 text-sm">
      <span className="flex items-center gap-1.5 font-medium">
        <ClipboardCheck className="h-4 w-4 text-ai" aria-hidden />
        Backoffice-Auftrag {auftragsnummer}
      </span>
      {auftraggeberName && <span className="text-muted-foreground">für {auftraggeberName}</span>}
      <StatusMarke status={status} pausiert={pausiert} />
      <span className="flex items-center gap-1.5 text-muted-foreground">
        Frist
        <FristMarke faelligAm={faelligAm} status={status} pausiert={pausiert} jetzt={new Date()} />
      </span>
      <Link
        href={`/backoffice/auftraege/${auftragId}`}
        className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        Zum Auftrag
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}
