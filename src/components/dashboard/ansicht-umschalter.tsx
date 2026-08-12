import Link from "next/link";
import { KanbanSquare, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardAnsicht = "board" | "tabelle";

/**
 * Umschalter zwischen den beiden Sichten der Arbeitszentrale: dem Kanban der
 * Vertriebsphasen (Standard) und der Arbeitsliste.
 *
 * Bewusst zwei Links statt eines Knopfes mit Zustand: Die Sicht steht in der
 * Adresse (`?ansicht=`), ist damit teilbar, überlebt einen Reload und braucht
 * kein Client-Bündel. Der Standard trägt keinen Parameter, damit /dashboard
 * die kurze, merkbare Adresse bleibt.
 */
export function AnsichtUmschalter({ aktiv }: { aktiv: DashboardAnsicht }) {
  const eintraege: Array<{ wert: DashboardAnsicht; label: string; href: string; icon: typeof Rows3 }> = [
    { wert: "board", label: "Board", href: "/dashboard", icon: KanbanSquare },
    { wert: "tabelle", label: "Tabelle", href: "/dashboard?ansicht=tabelle", icon: Rows3 },
  ];

  return (
    <div
      role="group"
      aria-label="Ansicht"
      className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5"
    >
      {eintraege.map((e) => {
        const an = e.wert === aktiv;
        const Icon = e.icon;
        return (
          <Link
            key={e.wert}
            href={e.href}
            aria-current={an ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              an
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {e.label}
          </Link>
        );
      })}
    </div>
  );
}
