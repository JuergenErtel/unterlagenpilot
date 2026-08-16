"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  ScanSearch,
  ListTodo,
  ListChecks,
  FileStack,
  Plug,
  Building2,
  ShieldCheck,
  BadgeEuro,
  KanbanSquare,
  Landmark,
  Settings,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_GROUPS: Array<{ label: string; items: Array<{ href: string; label: string; icon: LucideIcon }> }> = [
  {
    label: "Arbeit",
    items: [
      // Ganz oben: Die Tagesliste ist der Einstieg in die Arbeit, das Board
      // die Übersicht darüber.
      { href: "/heute", label: "Heute", icon: ListTodo },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/cases", label: "Fälle", icon: FolderOpen },
      { href: "/review", label: "Review-Center", icon: ScanSearch },
      // Die Pipeline hat seit dem 12.08.2026 keinen eigenen Menüpunkt mehr:
      // Sie IST das Dashboard (Standardsicht "Board").
      //
      // "Nachrichten" ist am 16.08.2026 gefolgt: Die Seite war ein Archiv der
      // letzten 50 erzeugten Nachrichten, das nichts ausser dem Menue
      // verlinkte. Erzeugt und versendet wird in der Fallakte
      // (/cases/<id>/messages), und genau dorthin fuehren auch die
      // Prioritaetsleiter und das Review-Center.
      { href: "/banken", label: "Banken-Wiki", icon: Landmark },
    ],
  },
  {
    label: "Konfiguration",
    items: [
      { href: "/checklists", label: "Checklisten", icon: ListChecks },
      { href: "/document-types", label: "Dokumenttypen", icon: FileStack },
      { href: "/connections", label: "Plattform-Verbindungen", icon: Plug },
      { href: "/organization", label: "Organisation & Team", icon: Building2 },
      { href: "/audit", label: "Audit-Log", icon: ShieldCheck },
      { href: "/plans", label: "Tarife", icon: BadgeEuro },
      { href: "/settings", label: "Einstellungen", icon: Settings },
    ],
  },
];

/** Nur fuer den Plattformbetreiber (User.platformAdmin). Die Sichtbarkeit hier
 *  ist reine Auffindbarkeit – den Zugang selbst regelt requirePlatformAdmin auf
 *  der Seite und in jeder Server Action (404 statt 403). */
export const PLATTFORM_GRUPPE: (typeof NAV_GROUPS)[number] = {
  label: "Plattform",
  items: [{ href: "/admin/anmeldungen", label: "Anmeldungen", icon: UserCheck }],
};

/** Welche Gruppen ein Nutzer sieht. Reine Funktion, damit ohne DOM pruefbar. */
export function navGruppen(platformAdmin: boolean): typeof NAV_GROUPS {
  return platformAdmin ? [...NAV_GROUPS, PLATTFORM_GRUPPE] : NAV_GROUPS;
}

export function SidebarNav({
  onNavigate,
  platformAdmin = false,
}: { onNavigate?: () => void; platformAdmin?: boolean } = {}) {
  const pathname = usePathname();
  const gruppen = navGruppen(platformAdmin);
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {gruppen.map((g) => (
        <div key={g.label}>
          <div className="eyebrow px-3 pb-2 text-[0.625rem]">{g.label}</div>
          <div className="space-y-px">
            {g.items.map((it) => {
              const active = pathname === it.href || (it.href !== "/dashboard" && pathname.startsWith(it.href));
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // Der aktive Eintrag ist der herausgezogene Registerreiter:
                    // eine Marke am linken Rand, kein eingefaerbter Kasten. Die
                    // Marke traegt das Markentuerkis – dieselbe Farbe, die in
                    // der App ueberall "hier passiert gerade etwas" bedeutet.
                    "relative flex items-center gap-3 rounded-md py-2 pl-4 pr-3 text-sm transition-colors",
                    "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:transition-colors",
                    active
                      ? "bg-accent font-semibold text-foreground before:bg-ai"
                      : "font-medium text-muted-foreground before:bg-transparent hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  <it.icon className={cn("h-4 w-4 shrink-0", active ? "text-ai" : "text-muted-foreground")} />
                  {it.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
