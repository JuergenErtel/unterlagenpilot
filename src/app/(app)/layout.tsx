import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getCurrentContext } from "@/lib/auth/context";
import { getEnv } from "@/lib/env";

// DB-gestützte Seiten immer zur Laufzeit rendern (kein Build-Time-Prerender).
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCurrentContext();

  if (!ctx) {
    // Session-Modus: echte Anmeldung erforderlich.
    if (getEnv().AUTH_MODE === "session") redirect("/login");
    // Demo-Modus ohne Seed: Hinweis statt Endlos-Redirect.
    return (
      <div className="mx-auto mt-24 max-w-md rounded-lg border bg-card p-8 text-center">
        <h1 className="text-lg font-semibold">Kein Kontext gefunden</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Die Datenbank enthält noch keine Organisation. Bitte führe{" "}
          <code className="rounded bg-muted px-1">npm run db:seed</code> aus.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm text-primary underline">
          Zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <AppShell
      context={{
        organizationName: ctx.organizationName,
        userName: ctx.userName,
        role: ctx.role,
        isDemo: ctx.isDemo,
      }}
    >
      {children}
    </AppShell>
  );
}
