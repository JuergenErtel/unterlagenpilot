import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/ui/tone";

export interface PipelineStage {
  key: string;
  label: string;
  count: number;
  tone?: Tone;
}

/**
 * Der Weg, den eine Akte nimmt: Importiert → Upload offen → … → Exportbereit.
 *
 * Sechs Kaesten nebeneinander waren die falsche Form – sie zeigen sechs
 * gleichrangige Dinge, obwohl es sich um EINE Strecke handelt. Jetzt sind es
 * Stationen auf einer durchgehenden Linie: die Zahl darueber, die Station
 * darunter, und ein Punkt auf der Linie, der gefuellt ist, solange dort etwas
 * liegt. Wo nichts liegt, bleibt die Station blass und tritt zurueck.
 */
export function Pipeline({ stages }: { stages: PipelineStage[] }) {
  return (
    <ol className="flex items-start gap-0 overflow-x-auto">
      {stages.map((s, i) => {
        const belegt = s.count > 0;
        return (
          <li key={s.key} className="flex min-w-[7.5rem] flex-1 flex-col">
            <p
              className={cn(
                "display tabular px-1 text-center text-xl leading-none",
                belegt ? "text-foreground" : "text-muted-foreground/40"
              )}
            >
              {s.count}
            </p>

            {/* Die Strecke selbst: Linie mit Station. Der erste und letzte
                Halbstrich fehlen, damit die Linie nicht ins Leere laeuft. */}
            <div className="mt-2.5 flex items-center" aria-hidden>
              <span className={cn("h-px flex-1", i === 0 ? "bg-transparent" : "bg-border")} />
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  belegt ? "bg-ai" : "border border-border bg-card"
                )}
              />
              <span
                className={cn("h-px flex-1", i === stages.length - 1 ? "bg-transparent" : "bg-border")}
              />
            </div>

            <p
              className={cn(
                "mt-2.5 px-1 text-center text-[11px] leading-tight",
                belegt ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {s.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
