import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { RegistrierungForm } from "@/components/auth/registrierung-form";
import { isEmailConfigured } from "@/lib/email/resend";
import { waehlbareTarife } from "@/lib/saas/plans";

export const dynamic = "force-dynamic";

export default function RegistrierenPage() {
  // Ohne Mailversand kaeme die Bestaetigungsmail nie an – dann lieber gar kein
  // Formular als Antraege, die niemand einloesen kann. `registriere` prueft
  // dasselbe noch einmal selbst; diese Abfrage hier ist nur die Anzeige.
  const moeglich = isEmailConfigured();

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-11 w-auto" />
          <p className="text-sm text-muted-foreground">KI-Sachbearbeiter für Baufinanzierung</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Zugang anfragen</CardTitle>
            <CardDescription>
              Jede Anmeldung wird von uns von Hand geprüft. Nach der Freigabe erhalten Sie eine
              E-Mail und können sofort loslegen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {moeglich ? (
              <RegistrierungForm tarife={waehlbareTarife()} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Die Registrierung ist gerade nicht verfügbar. Bitte schreiben Sie uns an
                info@baufidesk.de.
              </p>
            )}
          </CardContent>
          <CardFooter>
            <p className="text-center text-xs text-muted-foreground">
              Sie haben schon einen Zugang? <Link href="/login" className="underline">Anmelden</Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
