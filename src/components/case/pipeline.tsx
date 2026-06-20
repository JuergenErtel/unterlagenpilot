import { cn } from "@/lib/utils";
import { TONE, type Tone } from "@/lib/ui/tone";

export interface PipelineStage {
  key: string;
  label: string;
  count: number;
  tone?: Tone;
}

/** Horizontale Mini-Pipeline: Importiert → Upload offen → … → Exportbereit. */
export function Pipeline({ stages }: { stages: PipelineStage[] }) {
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
      {stages.map((s, i) => {
        const tone = s.tone ?? (s.count > 0 ? "ai" : "neutral");
        return (
          <div key={s.key} className="flex min-w-[8.5rem] flex-1 items-center">
            <div className="flex-1 rounded-lg border bg-card px-3 py-2.5 shadow-soft">
              <div className="flex items-center gap-2">
                <span className={cn("font-mono text-lg font-semibold tabular", count(tone, s.count))}>{s.count}</span>
              </div>
              <div className="mt-0.5 text-[11px] font-medium leading-tight text-muted-foreground">{s.label}</div>
              <div className={cn("mt-2 h-1 rounded-full", TONE[tone].bar, s.count === 0 && "opacity-40")} />
            </div>
            {i < stages.length - 1 && (
              <div className="px-1 text-muted-foreground/50" aria-hidden>
                ›
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function count(tone: Tone, n: number): string {
  return n === 0 ? "text-muted-foreground/50" : TONE[tone].text;
}
