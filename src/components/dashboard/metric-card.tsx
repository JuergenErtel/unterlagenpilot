import Link from "next/link";
import { cn } from "@/lib/utils";
import { TONE, type Tone } from "@/lib/ui/tone";

export function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: React.ElementType;
  href?: string;
}) {
  const inner = (
    <div className="group flex h-full flex-col justify-between rounded-lg border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", TONE[tone].bg)}>
            <Icon className={cn("h-4 w-4", TONE[tone].text)} />
          </span>
        )}
      </div>
      <div className="mt-3">
        <div className={cn("font-mono text-2xl font-semibold tabular", tone === "neutral" ? "text-foreground" : TONE[tone].text)}>
          {value}
        </div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
