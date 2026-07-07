import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { getEnv } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const env = getEnv();

  // Bereits angemeldet (echte Session) → direkt weiter.
  const ctx = await getCurrentContext();
  if (ctx && !ctx.isDemo) redirect(next && next.startsWith("/") ? next : "/dashboard");

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-11 w-auto" />
          <p className="text-sm text-muted-foreground">
            KI-Sachbearbeiter für Baufinanzierung
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Anmelden</CardTitle>
            <CardDescription>Melden Sie sich bei Ihrem Konto an.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm next={next} />
          </CardContent>
          <CardFooter>
            <p className="text-center text-xs text-muted-foreground">
              {env.AUTH_MODE === "demo"
                ? "Demo-Modus aktiv: Der Bereich ist auch ohne Anmeldung erreichbar. Für echte Kundendaten AUTH_MODE=session setzen."
                : "Mandantenfähige Anmeldung mit Rollen und Organisationstrennung."}
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
