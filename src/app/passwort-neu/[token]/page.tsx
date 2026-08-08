import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { PasswortNeuForm } from "@/components/auth/passwort-neu-form";

export const dynamic = "force-dynamic";

export default async function PasswortNeuPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-11 w-auto" />
          <p className="text-sm text-muted-foreground">KI-Sachbearbeiter für Baufinanzierung</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Neues Passwort setzen</CardTitle>
            <CardDescription>Wählen Sie ein neues Passwort für Ihr Konto.</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswortNeuForm token={token} />
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
