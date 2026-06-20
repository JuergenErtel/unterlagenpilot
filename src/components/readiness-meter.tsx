import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ReadinessResult } from "@/lib/documents/readiness";

const BAND_COLOR: Record<ReadinessResult["band"], string> = {
  fehlend: "bg-destructive",
  teilweise: "bg-warning",
  fast: "bg-primary",
  fertig: "bg-success",
};

export function ReadinessMeter({
  readiness,
  className,
}: {
  readiness: ReadinessResult;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Einreichungsstatus</span>
        <span className="tabular-nums font-semibold">{readiness.score} %</span>
      </div>
      <Progress value={readiness.score} indicatorClassName={BAND_COLOR[readiness.band]} />
      <p className="text-xs text-muted-foreground">{readiness.label}</p>
    </div>
  );
}
