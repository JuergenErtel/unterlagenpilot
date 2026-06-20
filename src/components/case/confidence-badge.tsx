import { Badge } from "@/components/ui/badge";
import { confidenceLevel } from "@/lib/ui/tone";

const VARIANT = { hoch: "success", mittel: "warning", niedrig: "destructive" } as const;

/** Konfidenz-Stufe als Badge (hoch/mittel/niedrig) – für erkannte KI-Felder. */
export function ConfidenceBadge({ value, showPercent = false }: { value: number; showPercent?: boolean }) {
  const { label } = confidenceLevel(value);
  return (
    <Badge variant={VARIANT[label]} className="font-medium">
      {label}
      {showPercent && <span className="font-mono tabular opacity-70">{Math.round(value * 100)}%</span>}
    </Badge>
  );
}
