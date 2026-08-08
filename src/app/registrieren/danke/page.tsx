import { Logo } from "@/components/brand/logo";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Nach dem Absenden des Formulars – unabhaengig davon, ob die Adresse neu war
 * oder schon existierte (siehe registriere() in lib/actions/registrierung.ts).
 * Deshalb darf dieser Text keinerlei Hinweis auf den tatsaechlichen Zustand
 * geben.
 */
export default function RegistrierenDankePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-11 w-auto" />
          <p className="text-sm text-muted-foreground">KI-Sachbearbeiter für Baufinanzierung</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Fast geschafft</CardTitle>
            <CardDescription>
              Wir haben Ihnen eine E-Mail geschickt. Bitte bestätigen Sie darin Ihre Adresse — der
              Link ist 48 Stunden gültig. Danach prüfen wir Ihre Anmeldung von Hand und melden uns
              per E-Mail.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </main>
  );
}
