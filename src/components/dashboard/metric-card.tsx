import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Einzelne Kennzahl mit eigener Flaeche.
 *
 * Nur noch dort im Einsatz, wo wenige Zahlen fuer sich stehen (Pipeline). Wo
 * viele Zahlen zusammengehoeren, gehoert das Kennzahlenband hin – ein Raster
 * aus gleich grossen Kaesten sagt sonst "alles gleich wichtig".
 *
 * Die Zahl steht in der Displayschrift, nicht in der Schreibmaschinenschrift:
 * Betraege sollen wie eine Bilanzzeile lesen, nicht wie Quelltext. Farbe traegt
 * sie nur, wenn sie eine Handlung verlangt – eine Null berichtet und tritt
 * zurueck.
 */
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** Wird ignoriert – bleibt fuer bestehende Aufrufe erhalten. */
  tone?: string;
  icon?: React.ElementType;
  href?: string;
}) {
  const leer = value === 0 || value === "0";

  const inner = (
    <div
      className={cn(
        "flex h-full flex-col justify-between rounded-lg border bg-card p-4 card-elevated",
        href && "transition-shadow hover:shadow-lift"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground/60" />}
      </div>
      <div className="mt-4">
        <div
          className={cn(
            "display tabular text-2xl leading-none",
            leer ? "text-muted-foreground/45" : "text-foreground"
          )}
        >
          {value}
        </div>
        {hint && <div className="mt-1.5 text-[11px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
