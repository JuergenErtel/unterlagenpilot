import Link from "next/link";
import {
  LayoutDashboard,
  FolderOpen,
  FilePlus2,
  Link2,
  ListChecks,
  ScanSearch,
  Send,
  Plug,
  Settings,
  ShieldCheck,
  Building2,
  BadgeEuro,
} from "lucide-react";

const NAV: Array<{ href: string; label: string; icon: React.ElementType }> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cases", label: "Fälle", icon: FolderOpen },
  { href: "/cases/new", label: "Neuer Fall", icon: FilePlus2 },
  { href: "/review", label: "Review-Center", icon: ScanSearch },
  { href: "/checklists", label: "Checklisten", icon: ListChecks },
  { href: "/connections", label: "Plattform-Verbindungen", icon: Plug },
  { href: "/messages", label: "Nachrichten", icon: Send },
  { href: "/plans", label: "SaaS-Tarife", icon: BadgeEuro },
  { href: "/organization", label: "Organisation / Team", icon: Building2 },
  { href: "/audit", label: "Audit-Log", icon: ShieldCheck },
  { href: "/settings", label: "Einstellungen", icon: Settings },
];

export function AppShell({
  children,
  context,
}: {
  children: React.ReactNode;
  context: { organizationName: string; userName: string; role: string };
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Link2 className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">UnterlagenPilot</div>
            <div className="text-[10px] text-muted-foreground">immocockpit24.de</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </Link>
          ))}
        </nav>
        <div className="border-t p-4">
          <div className="text-sm font-medium">{context.userName}</div>
          <div className="text-xs text-muted-foreground">{context.organizationName}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {context.role}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-card/60 px-6 backdrop-blur">
          <div className="text-sm text-muted-foreground">
            KI-Sachbearbeiter für Baufinanzierung
          </div>
          <div className="text-xs text-muted-foreground">
            Manuelle Freigabe vor jeder Übertragung · DSGVO/EU
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
