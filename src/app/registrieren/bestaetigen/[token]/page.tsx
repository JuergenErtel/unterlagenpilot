import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { bestaetigeEmail } from "@/lib/auth/signup";
import { benachrichtigeBetreiber } from "@/lib/actions/registrierung-benachrichtigung";

export const dynamic = "force-dynamic";

export default async function BestaetigenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ergebnis = await bestaetigeEmail(token);
  if (ergebnis.ok) await benachrichtigeBetreiber(ergebnis.email, ergebnis.firmenname);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center"><Logo className="h-11 w-auto" /></div>
        <Card>
          <CardHeader>
            <CardTitle>{ergebnis.ok ? "Adresse bestätigt" : "Link nicht gültig"}</CardTitle>
            <CardDescription>
              {ergebnis.ok
                ? "Vielen Dank. Wir prüfen Ihre Anmeldung jetzt von Hand und melden uns per E-Mail – in der Regel innerhalb eines Werktags."
                : "Dieser Link ist abgelaufen oder wurde bereits verwendet. Bitte registrieren Sie sich erneut."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={ergebnis.ok ? "/login" : "/registrieren"} className="text-sm underline">
              {ergebnis.ok ? "Zur Anmeldung" : "Zur Registrierung"}
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
