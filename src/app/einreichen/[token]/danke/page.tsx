import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Bestaetigung nach der Einreichung. Der Upload-Token kommt nur in dieser
 * einen Antwort; danach kann nur das Backoffice einen neuen Upload-Link
 * erzeugen. Ohne Parameter (Honeypot-Weiterleitung) steht hier nur der Dank.
 */
export default async function EinreichenDankePage({
  searchParams,
}: {
  searchParams: Promise<{ nr?: string; upload?: string }>;
}) {
  const { nr, upload } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <Logo />
      <h1 className="text-xl font-semibold">Vielen Dank, Ihr Auftrag ist eingegangen</h1>
      {nr && (
        <p className="text-sm">
          Auftragsnummer: <span className="font-medium">{nr}</span>. Bitte nennen Sie sie bei Rückfragen.
        </p>
      )}
      {upload ? (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm">
            Laden Sie jetzt die Unterlagen hoch. Dieser Upload-Zugang gilt 72 Stunden und ist nur über diese Seite
            erreichbar. Wenn Sie ihn später brauchen, erzeugt Ihr Backoffice einen neuen.
          </p>
          <Button asChild>
            <a href={`/upload/${encodeURIComponent(upload)}`}>Unterlagen jetzt hochladen</a>
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Das Backoffice meldet sich bei Ihrer Ansprechperson.</p>
      )}
    </main>
  );
}
