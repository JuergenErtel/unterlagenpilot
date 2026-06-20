import Link from "next/link";
import { Compass } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2 text-xl font-semibold">
            <Compass className="h-6 w-6 text-primary" />
            UnterlagenPilot
          </div>
          <p className="text-sm text-muted-foreground">
            KI-Sachbearbeiter für Baufinanzierung
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Anmelden</CardTitle>
            <CardDescription>
              Melden Sie sich bei Ihrem Konto an.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="name@kanzlei.de"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <Button asChild className="w-full">
              <Link href="/dashboard">Anmelden</Link>
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              MVP: Demo-Zugang ohne echte Authentifizierung. Produktiv:
              mandantenfähige Auth mit Rollen.
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
