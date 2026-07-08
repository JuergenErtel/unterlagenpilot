import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TONE, type Tone } from "@/lib/ui/tone";

export interface RoadmapStep {
  title: string;
  tone: Tone;
  summary: string;
  blocker?: string;
  action?: { label: string; href: string };
  /** Mehrere Aktionen (z.B. „Selbst hochladen" + „Upload-Link erstellen"). Hat Vorrang vor `action`. */
  actions?: Array<{ label: string; href: string; variant?: "default" | "outline" }>;
}

/** Vertikale Roadmap des Falls: Kundendaten → … → Plattform-Export. */
export function CaseRoadmap({ steps }: { steps: RoadmapStep[] }) {
  return (
    <ol className="relative space-y-1">
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex gap-4 rounded-lg p-3 transition-colors hover:bg-accent/40">
          {/* Verbindungslinie */}
          {i < steps.length - 1 && (
            <span className="absolute left-[27px] top-12 h-[calc(100%-1.5rem)] w-px bg-border" aria-hidden />
          )}
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-mono text-sm font-semibold tabular",
              TONE[s.tone].border,
              TONE[s.tone].bg,
              TONE[s.tone].text
            )}
          >
            {s.tone === "ready" ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{s.title}</span>
              {s.blocker && <Badge variant="destructive">{s.blocker}</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{s.summary}</p>
            {s.actions && s.actions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {s.actions.map((a) => (
                  <Button key={`${a.href}|${a.label}`} asChild size="sm" variant={a.variant ?? "outline"}>
                    <Link href={a.href}>{a.label}</Link>
                  </Button>
                ))}
              </div>
            ) : s.action ? (
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href={s.action.href}>{s.action.label}</Link>
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
