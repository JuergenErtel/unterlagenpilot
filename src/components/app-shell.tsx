import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "@/components/sidebar-nav";
import { MobileNav } from "@/components/mobile-nav";
import { logout } from "@/lib/actions/auth";
import { USER_ROLE_LABELS } from "@/lib/domain/enums";
import { BereichKopf } from "@/components/bereich-kopf";
import type { Bereiche } from "@/lib/backoffice/bereich";

export function AppShell({
  children,
  context,
}: {
  children: React.ReactNode;
  context: {
    organizationName: string;
    userName: string;
    role: string;
    isDemo?: boolean;
    platformAdmin?: boolean;
    bereiche?: Bereiche;
  };
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
        <Link href="/dashboard" className="flex h-14 shrink-0 items-center border-b px-5">
          <Logo className="h-7 w-auto" />
        </Link>

        <SidebarNav platformAdmin={context.platformAdmin} bereiche={context.bereiche} />

        <div className="shrink-0 space-y-2 border-t p-3">
          <div className="flex items-center gap-3 px-2 py-1.5">
            {/* Kein rundes Profilbild: ein eckiges Namensschild passt zur Akte
                und unterscheidet sich von den runden Statusmarken. */}
            <div className="display flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary text-[0.6875rem] tracking-normal text-primary-foreground">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[0.8125rem] font-medium leading-tight">
                {context.userName}
              </div>
              <div className="truncate text-xs leading-tight text-muted-foreground">
                {roleLabel} · {context.organizationName}
              </div>
            </div>
          </div>
          {context.isDemo ? (
            <div className="rounded-md bg-warning/10 px-2 py-1 text-[10px] font-medium text-warning">
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
        {/*
          Die Kopfzeile traegt bewusst fast nichts: Sie steht auf jedem
          Bildschirm und darf deshalb nichts wiederholen, was die Seite selbst
          schon sagt. Uebrig bleibt der eine Satz, der fuer diese App
          konstitutiv ist – dass nichts ohne Freigabe das Haus verlaesst.
        */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b bg-canvas/85 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <MobileNav context={context} />
            <Logo className="h-6 w-auto md:hidden" />
            {/* Der Produktname steht auf jedem Bildschirm des Bereichs: Wer
                im Backoffice arbeitet, soll es nie mit dem Vertrieb
                verwechseln - und umgekehrt. Ohne zweiten Bereich bleibt die
                Kopfzeile, wie sie war. */}
            <BereichKopf bereiche={context.bereiche} />
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
            <span className="hidden sm:inline">Manuelle Freigabe vor jeder Übertragung · DSGVO/EU</span>
            <span className="sm:hidden">DSGVO/EU</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[92rem] flex-1 animate-fade-in p-4 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
