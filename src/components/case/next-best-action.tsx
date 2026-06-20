import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TONE, type Tone } from "@/lib/ui/tone";

export interface NextAction {
  title: string;
  detail?: string;
  href?: string;
  tone?: Tone;
}

/** "Nächste beste Aktion" – KI-priorisierte To-dos für den Fall. */
export function NextBestAction({ actions, primary }: { actions: NextAction[]; primary?: React.ReactNode }) {
  return (
    <Card className="border-ai/30 bg-ai/[0.03]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-ai" />
          Nächste beste Aktion
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {primary}
        <ol className="space-y-1.5">
          {actions.map((a, i) => {
            const t = a.tone ?? "ai";
            const row = (
              <div className="flex items-start gap-3 rounded-md p-2 transition-colors hover:bg-card">
                <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold tabular", TONE[t].bg, TONE[t].text)}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-tight">{a.title}</div>
                  {a.detail && <div className="text-xs text-muted-foreground">{a.detail}</div>}
                </div>
                {a.href && <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </div>
            );
            return a.href ? (
              <li key={i}>
                <Link href={a.href}>{row}</Link>
              </li>
            ) : (
              <li key={i}>{row}</li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
