import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { EinladungForm } from "@/components/auth/einladung-form";
import { liesEinladung } from "@/lib/auth/invite";

export const dynamic = "force-dynamic";

export default async function EinladungPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Nur lesend – eingeloest wird die Einladung erst mit dem Passwort.
  // Ohne Organisation und Einladenden haette die Seite die Form einer
  // Phishing-Seite: sie fragt sonst voellig zusammenhanglos nach einem Passwort.
  const kontext = await liesEinladung(token);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-11 w-auto" />
          <p className="text-sm text-muted-foreground">KI-Sachbearbeiter für Baufinanzierung</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Einladung annehmen</CardTitle>
            <CardDescription>
              {kontext ? (
                <>
                  {kontext.einladenderName
                    ? `${kontext.einladenderName} hat Sie eingeladen, `
                    : "Sie wurden eingeladen, "}
                  der Organisation <strong>{kontext.organisation}</strong> auf BaufiDesk
                  beizutreten. Vergeben Sie hier Ihr Passwort, um die Einrichtung abzuschließen.
                </>
              ) : (
                "Diese Einladung ist abgelaufen oder wurde bereits verwendet. Bitte lassen Sie sich " +
                "von Ihrer Organisation eine neue schicken."
              )}
            </CardDescription>
          </CardHeader>
          {kontext ? (
            <CardContent>
              <EinladungForm token={token} />
            </CardContent>
          ) : null}
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
