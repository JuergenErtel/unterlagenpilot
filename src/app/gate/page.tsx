import { Logo } from "@/components/brand/logo";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

/**
 * Passwort-Gate vor der gesamten App (Pilotbetrieb). Einfaches Server-Formular,
 * das das geteilte Passwort an /api/gate übergibt – funktioniert auch ohne JS.
 */
export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

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
            <CardTitle>Zugang geschützt</CardTitle>
            <CardDescription>
              Dieser Bereich ist derzeit passwortgeschützt. Bitte Zugangspasswort
              eingeben.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form method="POST" action="/api/gate" className="space-y-4">
              <input type="hidden" name="next" value={safeNext} />
              <div className="space-y-1.5">
                <Label htmlFor="password">Passwort</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  required
                />
              </div>
              {error ? (
                <p
                  className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  role="alert"
                >
                  Falsches Passwort. Bitte erneut versuchen.
                </p>
              ) : null}
              <Button type="submit" className="w-full">
                Weiter
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
