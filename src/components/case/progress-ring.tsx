import { cn } from "@/lib/utils";
import { TONE, readinessTone, type Tone } from "@/lib/ui/tone";

/** Kreisförmige Fortschrittsanzeige (Einreichungs-Score). Reines SVG. */
export function ProgressRing({
  value,
  size = 132,
  stroke = 10,
  tone,
  label,
  sublabel,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  label?: string;
  sublabel?: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;
  const t = tone ?? readinessTone(v).tone;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={cn("transition-[stroke-dashoffset] duration-700", TONE[t].ring)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-mono text-3xl font-semibold tabular", TONE[t].text)}>{v}%</span>
        {label && <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</span>}
        {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
      </div>
    </div>
  );
}
