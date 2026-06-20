import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { TONE, type Tone } from "@/lib/ui/tone";
import { PLATFORM_LABELS, type Platform } from "@/lib/domain/enums";

export interface MissingItem {
  key: string;
  title: string;
  reason: string;
  platform?: Platform | "allgemein";
  customerText?: string;
  internalNote?: string;
}

export interface MissingGroup {
  key: string;
  title: string;
  tone: Tone;
  items: MissingItem[];
}

/** "Was fehlt noch?" – gruppierte fehlende Unterlagen mit Aktionen. */
export function MissingDocumentsPanel({
  groups,
  nachforderungHref,
}: {
  groups: MissingGroup[];
  nachforderungHref: string;
}) {
  const active = groups.filter((g) => g.items.length > 0);
  if (active.length === 0) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/[0.04] p-6 text-center">
        <p className="text-sm font-medium text-success">Alle erforderlichen Unterlagen liegen vor.</p>
        <p className="mt-1 text-sm text-muted-foreground">Dieser Fall ist bereit für die nächste Prüfung.</p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {active.map((g) => (
        <section key={g.key}>
          <div className="mb-2 flex items-center gap-2">
            <StatusDot tone={g.tone} />
            <h3 className="text-sm font-semibold">{g.title}</h3>
            <Badge variant="neutral" className="font-mono tabular">{g.items.length}</Badge>
          </div>
          <div className="space-y-2">
            {g.items.map((it) => (
              <div key={it.key} className={cn("rounded-lg border p-3", TONE[g.tone].border)}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{it.title}</span>
                      {it.platform && it.platform !== "allgemein" && (
                        <Badge variant="outline">{PLATFORM_LABELS[it.platform as Platform]}</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{it.reason}</p>
                    {it.internalNote && (
                      <p className="mt-1 text-xs text-muted-foreground/80">
                        <span className="font-medium">Intern:</span> {it.internalNote}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button asChild size="sm" variant="outline">
                      <Link href={nachforderungHref}>In Nachforderung</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
