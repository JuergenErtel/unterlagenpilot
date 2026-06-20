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

function tone(p: number) {
  return p >= 90 ? "ready" : p >= 60 ? "review" : "blocker";
}

/** Plattform-Bereitschaft (Europace/FinLink/eHyp) als kompakte Zeilen mit Mini-Bar. */
export function PlatformReadiness({
  items,
  compact = false,
}: {
  items: PlatformReadinessItem[];
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", compact ? "" : "sm:grid-cols-3")}>
      {items.map((it) => {
        const t = tone(it.percent);
        return (
          <div key={it.platform} className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusDot tone={t} />
                <span className="text-sm font-medium">{PLATFORM_LABELS[it.platform]}</span>
              </div>
              <span className={cn("font-mono text-sm font-semibold tabular", TONE[t].text)}>{it.percent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-all", TONE[t].bar)} style={{ width: `${it.percent}%` }} />
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              {it.missingFields === 0 && it.missingDocs === 0
                ? "Bereit zur Einreichung"
                : `${it.missingFields} Feld(er), ${it.missingDocs} Dok. offen`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
