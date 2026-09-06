import { Logo } from "@/components/brand/logo";
import { loeseEinreichungsToken } from "@/lib/backoffice/einreichung";
import { AUFTRAGSARTEN } from "@/lib/backoffice/leistungen";
import { EinreichungForm } from "@/components/einreichung/einreichung-form";

export const dynamic = "force-dynamic";

/**
 * Oeffentliche Eingangstuer des Backoffice fuer Auftraggeber ohne
 * BaufiDesk-Konto. Der Token im Pfad ist das einzige Geheimnis; die Seite
 * zeigt nach aussen nur die Namen von Backoffice und Auftraggeber, keine
 * Auftraege, keinen Status, kein Ergebnis.
 */
export default async function EinreichenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ziel = await loeseEinreichungsToken(token);

  if (!ziel) {
    // Unbekannt und deaktiviert sehen gleich aus.
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
        <Logo />
        <h1 className="text-lg font-semibold">Dieser Link ist nicht mehr gültig</h1>
        <p className="text-sm text-muted-foreground">
          Bitte wenden Sie sich an Ihr Backoffice, um einen neuen Einreichungslink zu erhalten.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-6">
      <Logo />
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{ziel.backofficeName}</p>
        <h1 className="text-xl font-semibold">Auftrag einreichen</h1>
        <p className="text-sm text-muted-foreground">
          Für {ziel.auftraggeberName}. Nach dem Absenden können Sie die Unterlagen direkt hochladen.
        </p>
      </header>
      <EinreichungForm
        token={token}
        auftragsarten={AUFTRAGSARTEN.map((a) => ({ key: a.key, label: a.label, beschreibung: a.beschreibung }))}
      />
      <p className="mt-auto text-xs text-muted-foreground">
        Ihre Angaben werden verschlüsselt übertragen und ausschließlich zur Bearbeitung dieses Auftrags verwendet.{" "}
        <a href="/datenschutz" className="underline">
          Datenschutzhinweise
        </a>
      </p>
    </main>
  );
}
