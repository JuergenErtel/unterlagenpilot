import { cn } from "@/lib/utils";
import { TONE } from "@/lib/ui/tone";
import { StatusDot } from "@/components/ui/status-dot";
import {
  BACKOFFICE_PRIORITAET_LABELS,
  BACKOFFICE_STATUS_LABELS,
  BACKOFFICE_STATUS_PORTAL_LABELS,
  type BackofficePrioritaet,
  type BackofficeStatus,
} from "@/lib/domain/enums";
import { prioritaetTone, slaTone, statusTone } from "@/lib/backoffice/anzeige";
import { bewerteSla } from "@/lib/backoffice/sla";
import { STATUS_STATIONEN, stationIndex } from "@/lib/backoffice/status";

/**
 * Die Marken des Backoffice: Status, Frist, Prioritaet. Farbe UND Text -
 * niemand soll eine Farbe deuten muessen. Server-tauglich (keine Hooks).
 */

export function StatusMarke({
  status,
  pausiert,
  portal,
  className,
}: {
  status: BackofficeStatus;
  pausiert?: boolean;
  /** Kundentaugliche Bezeichnung fuer das Auftraggeberportal. */
  portal?: boolean;
  className?: string;
}) {
  const tone = pausiert ? "neutral" : statusTone(status);
  const label = pausiert ? "Pausiert" : (portal ? BACKOFFICE_STATUS_PORTAL_LABELS : BACKOFFICE_STATUS_LABELS)[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE[tone].bg,
        TONE[tone].text,
        TONE[tone].border,
        className
      )}
    >
      <StatusDot tone={tone} />
      {label}
    </span>
  );
}

export function FristMarke({
  faelligAm,
  status,
  pausiert,
  jetzt,
  className,
}: {
  faelligAm: Date | null;
  status: BackofficeStatus;
  pausiert: boolean;
  jetzt: Date;
  className?: string;
}) {
  const sla = bewerteSla({ faelligAm, status, pausiert, jetzt });
  const tone = slaTone(sla.zustand);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium tabular", TONE[tone].text, className)}>
      <StatusDot tone={tone} />
      {sla.label}
    </span>
  );
}

export function PrioritaetMarke({ prioritaet, className }: { prioritaet: BackofficePrioritaet; className?: string }) {
  if (prioritaet === "normal") return null;
  const tone = prioritaetTone(prioritaet);
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0 text-[0.6875rem] font-semibold uppercase tracking-wide", TONE[tone].bg, TONE[tone].text, TONE[tone].border, className)}>
      {BACKOFFICE_PRIORITAET_LABELS[prioritaet]}
    </span>
  );
}

/**
 * Stationenleiste: der Weg eines Auftrags von Eingang bis Abschluss. Fuer
 * Auftrag und Portal dieselbe Leiste - im Portal mit den Portal-Labels.
 */
export function StationenLeiste({ status, portal, className }: { status: BackofficeStatus; portal?: boolean; className?: string }) {
  const aktiv = stationIndex(status);
  const terminalAbbruch = status === "abgelehnt" || status === "storniert";
  const labels = portal ? BACKOFFICE_STATUS_PORTAL_LABELS : BACKOFFICE_STATUS_LABELS;
  return (
    <ol className={cn("flex flex-wrap gap-x-4 gap-y-2", className)} aria-label="Stationen des Auftrags">
      {STATUS_STATIONEN.map((s, i) => {
        const erreicht = !terminalAbbruch && i <= aktiv;
        const istAktuell = !terminalAbbruch && i === aktiv;
        return (
          <li key={s} className="flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                "inline-flex h-4 w-4 items-center justify-center rounded-full border text-[0.625rem] font-semibold",
                erreicht ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                istAktuell && "ring-2 ring-ai/40"
              )}
              aria-hidden
            >
              {i + 1}
            </span>
            <span className={cn(erreicht ? "font-medium text-foreground" : "text-muted-foreground")}>{labels[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}
