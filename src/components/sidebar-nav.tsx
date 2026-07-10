"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  ScanSearch,
  Send,
  ListChecks,
  FileStack,
  Plug,
  Building2,
  ShieldCheck,
  BadgeEuro,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_GROUPS: Array<{ label: string; items: Array<{ href: string; label: string; icon: LucideIcon }> }> = [
  {
    label: "Arbeit",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/cases", label: "Fälle", icon: FolderOpen },
      { href: "/review", label: "Review-Center", icon: ScanSearch },
      { href: "/messages", label: "Nachrichten", icon: Send },
      { href: "/pipeline", label: "Abschlüsse", icon: BadgeEuro },
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

export function SidebarNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto p-3">
      {NAV_GROUPS.map((g) => (
        <div key={g.label}>
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {g.label}
          </div>
          <div className="space-y-0.5">
            {g.items.map((it) => {
              const active = pathname === it.href || (it.href !== "/dashboard" && pathname.startsWith(it.href));
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <it.icon className="h-4 w-4" />
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
