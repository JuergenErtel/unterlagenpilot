import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BestaetigenForm } from "@/components/auth/bestaetigen-form";
import { liesBestaetigung } from "@/lib/auth/signup";

export const dynamic = "force-dynamic";

/**
 * Der Aufruf schlaegt das Token nur nach – verbraucht wird es erst durch den
 * Knopf (siehe BestaetigenForm). Sonst entwertet jeder Link-Scanner in einem
 * Firmen-Mailserver die Bestaetigung, bevor ein Mensch sie anklickt. Die beiden
 * anderen Token-Strecken (/passwort-neu, /einladung) halten es genauso.
 */
export default async function BestaetigenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const vorschau = await liesBestaetigung(token);

  if (!vorschau.ok) {
    return (
      <Rahmen
        titel="Link nicht gültig"
        beschreibung="Dieser Link ist abgelaufen oder wurde bereits verwendet. Fragen Sie den Zugang einfach erneut an – Sie erhalten dann einen frischen Bestätigungslink."
      >
        <Link href="/registrieren" className="text-sm underline">
          Neuen Link anfordern
        </Link>
      </Rahmen>
    );
  }

  if (vorschau.bereitsBestaetigt) {
    return (
      <Rahmen
        titel="Adresse bereits bestätigt"
        beschreibung={`Ihre Anmeldung für ${vorschau.firmenname} liegt uns vor. Wir prüfen sie von Hand und melden uns per E-Mail.`}
      >
        <Link href="/login" className="text-sm underline">
          Zur Anmeldung
        </Link>
      </Rahmen>
    );
  }

  return (
    <Rahmen
      titel="Adresse bestätigen"
      beschreibung={`Bestätigen Sie Ihre E-Mail-Adresse für ${vorschau.firmenname}. Danach prüfen wir Ihre Anmeldung von Hand und melden uns per E-Mail.`}
    >
      <BestaetigenForm token={token} />
    </Rahmen>
  );
}

function Rahmen({
  titel,
  beschreibung,
  children,
}: {
  titel: string;
  beschreibung: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Logo className="h-11 w-auto" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{titel}</CardTitle>
            <CardDescription>{beschreibung}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}
