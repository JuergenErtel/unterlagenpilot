import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
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
    <AuthShell
      titel="Zugang anfragen"
      beschreibung="Jede Anmeldung wird von uns von Hand geprüft. Nach der Freigabe erhalten Sie eine E-Mail und können sofort loslegen."
      fuss={
        <>
          Sie haben schon einen Zugang?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Anmelden
          </Link>
        </>
      }
    >
      {moeglich ? (
        <RegistrierungForm tarife={waehlbareTarife()} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Die Registrierung ist gerade nicht verfügbar. Bitte schreiben Sie uns an
          info@baufidesk.de.
        </p>
      )}
    </AuthShell>
  );
}
