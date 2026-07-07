import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "@/components/sidebar-nav";
import { MobileNav } from "@/components/mobile-nav";
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
        <Link href="/dashboard" className="flex h-16 items-center border-b px-5">
          <Logo className="h-8 w-auto" />
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
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-2 border-b bg-card/80 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <MobileNav context={context} />
            <span className="hidden sm:inline">KI-Sachbearbeiter für Baufinanzierung</span>
            <Logo className="h-6 w-auto sm:hidden" />
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            <span className="hidden sm:inline">Manuelle Freigabe vor jeder Übertragung · DSGVO/EU</span>
            <span className="sm:hidden">DSGVO/EU</span>
          </div>
        </header>
        <main className="flex-1 animate-fade-in p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
