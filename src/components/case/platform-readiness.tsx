import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/ui/status-dot";
import { TONE } from "@/lib/ui/tone";
import { PLATFORM_LABELS, type Platform } from "@/lib/domain/enums";

export interface PlatformReadinessItem {
  platform: Platform;
  percent: number;
  missingFields: number;
  missingDocs: number;
}

/**
 * Unter 60 % ist der Stand NEUTRAL, nicht rot: Ein frischer Lead steht
 * naturgemäß bei ein paar Prozent – drei rote Punkte direkt unter dem
 * Kundennamen signalisierten "Problem", wo nur "noch am Anfang" gemeint war.
 * Rot bleibt in dieser App echten Blockern vorbehalten.
 */
function tone(p: number) {
  return p >= 90 ? "ready" : p >= 60 ? "review" : "neutral";
}

function Kachel({
  titel,
  untertitel,
  percent,
  missingFields,
  missingDocs,
}: {
  titel: string;
  untertitel?: string;
  percent: number;
  missingFields: number;
  missingDocs: number;
}) {
  const t = tone(percent);
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot tone={t} />
          <span className="text-sm font-medium">{titel}</span>
          {untertitel && <span className="text-[11px] text-muted-foreground">{untertitel}</span>}
        </div>
        <span className={cn("font-mono text-sm font-semibold tabular", TONE[t].text)}>{percent}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", TONE[t].bar)} style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">
        {missingFields === 0 && missingDocs === 0
          ? "Bereit zur Einreichung"
          : `${missingFields} Feld(er), ${missingDocs} Dok. offen`}
      </div>
    </div>
  );
}

/** Plattform-Bereitschaft (Europace/FinLink/eHyp) als kompakte Zeilen mit Mini-Bar. */
export function PlatformReadiness({
  items,
  compact = false,
}: {
  items: PlatformReadinessItem[];
  compact?: boolean;
}) {
  // Solange alle Plattformen dasselbe sagen, sagt es EINE Kachel: Dreimal
  // "6 %" nebeneinander lieferte null Zusatzinformation und wirkte wie
  // dreifacher Alarm. Sobald sich die Werte unterscheiden, fächert die
  // Anzeige wieder auf – dann trägt der Vergleich Information.
  const erste = items[0];
  const alleGleich =
    erste != null &&
    items.length > 1 &&
    items.every(
      (it) =>
        it.percent === erste.percent &&
        it.missingFields === erste.missingFields &&
        it.missingDocs === erste.missingDocs
    );

  if (alleGleich) {
    return (
      <Kachel
        titel="Alle Plattformen"
        untertitel={items.map((it) => PLATFORM_LABELS[it.platform]).join(" · ")}
        percent={erste.percent}
        missingFields={erste.missingFields}
        missingDocs={erste.missingDocs}
      />
    );
  }

  return (
    <div className={cn("grid gap-2", compact ? "" : "sm:grid-cols-3")}>
      {items.map((it) => (
        <Kachel
          key={it.platform}
          titel={PLATFORM_LABELS[it.platform]}
          percent={it.percent}
          missingFields={it.missingFields}
          missingDocs={it.missingDocs}
        />
      ))}
    </div>
  );
}
