import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getCurrentContext } from "@/lib/auth/context";
import { getEnv } from "@/lib/env";
import { ladeBereiche } from "@/lib/backoffice/zugriff";
import { ladeBackofficeZaehler } from "@/lib/backoffice/zaehler";
import { LEERE_ZAEHLER } from "@/lib/backoffice/bereich";

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

  // Welche Produkte dieser Nutzer sieht (Vertrieb immer; Backoffice mit
  // Rolle + Flag; Portal, wenn seine Organisation als Auftraggeber verknuepft
  // ist). Ohne zweiten Bereich sieht die Oberflaeche aus wie bisher.
  const bereiche = await ladeBereiche(ctx);
  // Zaehler nur, wenn das Backoffice ueberhaupt sichtbar ist - sonst kostet
  // die Leiste den Vertrieb keine einzige Abfrage.
  const zaehler = bereiche.backoffice ? await ladeBackofficeZaehler(ctx) : LEERE_ZAEHLER;

  return (
    <AppShell
      context={{
        organizationName: ctx.organizationName,
        userName: ctx.userName,
        role: ctx.role,
        platformAdmin: ctx.platformAdmin,
        isDemo: ctx.isDemo,
        bereiche,
        zaehler,
      }}
    >
      {children}
    </AppShell>
  );
}
