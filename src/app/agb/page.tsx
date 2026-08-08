export const dynamic = "force-static";

/**
 * Platzhalterseite. Der eigentliche AGB-Text ist noch NICHT geschrieben –
 * hier steht bewusst kein selbst erfundener Rechtstext, sondern nur die
 * Gliederung der zu fuellenden Abschnitte. Vor der Veroeffentlichung muss
 * dieser Inhalt durch die geprueften AGB ersetzt werden.
 */
export default function AgbPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Allgemeine Geschäftsbedingungen</h1>

      <div className="rounded-md border border-amber-500 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Platzhalter – noch kein rechtsgültiger Text.</strong> Dieser Inhalt muss vor der
        Veröffentlichung durch die geprüfte Fassung ersetzt werden.
      </div>

      <div className="space-y-2 text-sm text-muted-foreground">
        <p>Zu füllende Abschnitte:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Geltungsbereich</li>
          <li>Vertragsgegenstand</li>
          <li>Laufzeit und Kündigung</li>
          <li>Preise</li>
          <li>Haftung</li>
        </ol>
      </div>
    </main>
  );
}
