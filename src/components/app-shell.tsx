import Link from "next/link";
import { Link2, LogOut } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";
import { logout } from "@/lib/actions/auth";
import { USER_ROLE_LABELS } from "@/lib/domain/enums";

export function AppShell({
  children,
  context,
}: {
  children: React.ReactNode;
  context: { organizationName: string; userName: string; role: string; isDemo?: boolean };
}) {
  const initials = context.userName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  const roleLabel =
    USER_ROLE_LABELS[context.role as keyof typeof USER_ROLE_LABELS] ?? context.role;

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card md:flex">
        <Link href="/dashboard" className="flex h-16 items-center gap-2.5 border-b px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-soft">
            <Link2 className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">UnterlagenPilot</div>
            <div className="text-[10px] text-muted-foreground">immocockpit24.de</div>
          </div>
        </Link>

        <SidebarNav />

        <div className="space-y-2 border-t p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-1.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{context.userName}</div>
              <div className="truncate text-xs text-muted-foreground">
                {roleLabel} · {context.organizationName}
              </div>
            </div>
          </div>
          {context.isDemo ? (
            <div className="rounded-md bg-warning/10 px-2 py-1 text-[10px] font-medium text-warning-foreground">
              Demo-Zugang (ohne Login). Für echte Daten AUTH_MODE=session.
            </div>
          ) : (
            <form action={logout}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" /> Abmelden
              </button>
            </form>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-card/80 px-6 backdrop-blur">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden sm:inline">KI-Sachbearbeiter für Baufinanzierung</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            Manuelle Freigabe vor jeder Übertragung · DSGVO/EU
          </div>
        </header>
        <main className="flex-1 animate-fade-in p-6">{children}</main>
      </div>
    </div>
  );
}
