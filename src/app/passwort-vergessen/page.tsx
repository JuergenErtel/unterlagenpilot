import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { PasswortVergessenForm } from "@/components/auth/passwort-vergessen-form";

export const dynamic = "force-dynamic";

export default function PasswortVergessenPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-11 w-auto" />
          <p className="text-sm text-muted-foreground">KI-Sachbearbeiter für Baufinanzierung</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Passwort vergessen</CardTitle>
            <CardDescription>
              Geben Sie Ihre E-Mail-Adresse ein. Wir schicken Ihnen dann einen Link zum Setzen eines
              neuen Passworts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswortVergessenForm />
          </CardContent>
          <CardFooter>
            <p className="text-center text-xs text-muted-foreground">
              <Link href="/login" className="underline">Zurück zur Anmeldung</Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
