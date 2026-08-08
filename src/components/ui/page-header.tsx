import { cn } from "@/lib/utils";

/**
 * Seitenkopf.
 *
 * Das Eyebrow ist keine Dekoration, sondern die Registerbeschriftung: Es sagt,
 * in welchem Teil der Akte man steht. Deshalb gesperrte Versalien in der
 * Displayschrift und eine Haarlinie darunter – wie die Trennung zwischen
 * Registerreiter und Blatt.
 *
 * Der Titel steht in der Displayschrift, eng gesetzt. Fliesstext daneben
 * bleibt in der Leseschrift; die beiden sollen sich unterscheiden lassen.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b pb-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className="display text-[1.75rem] leading-none text-foreground">{title}</h1>
          {subtitle && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
