"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye, EyeOff, FileText, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  buendelZusammenfuegenAction,
  buendelVerwerfenAction,
  buendelErneutPruefenAction,
  type BuendelZusammenfuegenState,
} from "@/lib/actions/buendelung";

export interface BuendelView {
  id: string;
  titel: string;
  /** Die Quellseiten IN DER VORGESCHLAGENEN REIHENFOLGE. */
  seiten: Array<{ documentId: string; name: string; mimeType: string | null }>;
}

/**
 * Vorschlag, Einzelseiten zu Dokumenten zu buendeln.
 *
 * Je Buendel eigene Knoepfe, bewusst nicht alles oder nichts: ein Buendel kann
 * richtig und das naechste falsch sein.
 *
 * Die vollstaendige Seitenliste steht VOR dem Klick da - wer aus zwoelf
 * Dateien drei macht, will vorher sehen, welche wohin geht und in welcher
 * Reihenfolge.
 *
 * Client-Komponente NUR wegen der Buendel-Zeile: Sie braucht `useActionState`,
 * um ein fehlgeschlagenes Zusammenfuegen sichtbar zu machen, statt es wie
 * bisher schweigend zu verschlucken (der teuerste wiederkehrende Fehler in
 * diesem Projekt: Klick, und sichtbar passiert nichts). Alle Daten kommen als
 * einfache Props von der Fallseite - die bleibt Server-Komponente.
 */
export function BuendelVorschlagKarte({
  caseId,
  status,
  buendel,
  andererPollerLaeuft,
  kandidatenAnzahl,
}: {
  caseId: string;
  status: "ausstehend" | "laeuft" | "fertig" | "fehler";
  buendel: BuendelView[];
  /**
   * Pollt anderswo auf der Fallseite schon jemand (<AiCheckRunning> bei
   * kiLaufAktiv, <DocumentsProcessing> bei processingCount > 0), pollt diese
   * Karte NICHT zusaetzlich - sonst laeuft "die schwerste Seite der App" mit
   * zwei parallelen 4-Sekunden-Intervallen (page.tsx, Kommentar bei
   * kiLaufAktiv/processingCount). Faellt der andere Poller weg, waehrend der
   * Buendel-Lauf noch laeuft, uebernimmt diese Karte beim naechsten Rendern -
   * sonst saehe der Vermittler den Vorschlag erst nach manuellem Neuladen.
   */
  andererPollerLaeuft: boolean;
  /**
   * Wie viele buendelbare Einzelseiten der Fall gerade hat. Nur dafuer da, im
   * Zustand "noch nicht geprueft" zu entscheiden, ob es ueberhaupt etwas zu
   * pruefen gibt - siehe den Kommentar am fruehen Return unten.
   */
  kandidatenAnzahl: number;
}) {
  const router = useRouter();

  // Der Buendel-Lauf ist ein Hintergrundprozess ohne eigenes Push-Signal -
  // nur Neuladen zeigt, wenn er fertig ist. Die Karte pollt sich selbst,
  // genau wie <AiCheckRunning>/<DocumentsProcessing> es fuer ihre je eigene
  // "laeuft"-Anzeige tun - aber nur, wenn keiner der beiden schon laeuft
  // (siehe `andererPollerLaeuft` oben). Der Hook steht bewusst VOR jedem
  // fruehen Return - Hooks duerfen nicht von einer Bedingung uebersprungen
  // werden, nur ihr Effekt darf es.
  useEffect(() => {
    if (status !== "laeuft" || andererPollerLaeuft) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [status, andererPollerLaeuft, router]);

  const erneutPruefen = (
    <form action={buendelErneutPruefenAction}>
      <input type="hidden" name="caseId" value={caseId} />
      <SubmitButton size="sm" variant="ghost" pendingLabel="Wird geprüft …">
        Erneut prüfen
      </SubmitButton>
    </form>
  );

  // "Noch nicht geprueft": normalerweise keine Karte - ein Dauerhinweis, der
  // nichts sagt, ist schlimmer als nichts. ABER der Knopf zum Anstossen sass
  // bis zum 28.08. AUSSCHLIESSLICH in dieser Karte, und die erschien in genau
  // diesem Zustand nicht: Fuer jeden Fall, der noch nie einen Lauf hatte -
  // also fuer JEDEN Bestandsfall nach der Einfuehrung - war das Feature
  // unsichtbar und unerreichbar. Deshalb: sobald es ueberhaupt etwas zu pruefen
  // gibt, eine schmale Zeile mit dem Weg hinein. Ohne Einzelseiten bleibt es
  // still, denn dann gaebe es wirklich nichts zu tun.
  if (status === "ausstehend") {
    if (kandidatenAnzahl < 2) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2">
        <p className="text-xs text-muted-foreground">
          {kandidatenAnzahl} Einzelseiten in diesem Fall – noch nicht darauf geprüft, ob welche
          zusammengehören.
        </p>
        <form action={buendelErneutPruefenAction}>
          <input type="hidden" name="caseId" value={caseId} />
          <SubmitButton size="sm" pendingLabel="Wird geprüft …">
            Auf zusammengehörende Seiten prüfen
          </SubmitButton>
        </form>
      </div>
    );
  }

  if (status === "laeuft") {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
        Einzelseiten werden geprüft …
      </div>
    );
  }

  if (status === "fehler") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/[0.05] p-3">
        <p className="text-sm">Die Prüfung auf zusammengehörende Einzelseiten ist fehlgeschlagen.</p>
        {erneutPruefen}
      </div>
    );
  }

  const seitenGesamt = buendel.reduce((n, b) => n + b.seiten.length, 0);

  // Geprueft und nichts gefunden - das ist kein Fehler, aber es darf auch nicht
  // aussehen wie "nicht geprueft".
  if (buendel.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Keine zusammengehörenden Einzelseiten gefunden.
        </p>
        {erneutPruefen}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ai/30 bg-ai/[0.05] p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Layers className="h-4 w-4 shrink-0 text-ai" aria-hidden />
          Aus {seitenGesamt} Einzelseiten könnten {buendel.length}{" "}
          {buendel.length === 1 ? "Dokument" : "Dokumente"} werden
        </p>
        {erneutPruefen}
      </div>

      <ul className="mt-2 space-y-2">
        {buendel.map((b) => (
          <BuendelZeile key={b.id} caseId={caseId} buendel={b} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Eine Buendel-Zeile mit eigenem Aktionszustand: Jedes Buendel entscheidet
 * fuer sich, also braucht auch jedes seinen eigenen Fehlzustand - ein
 * gemeinsamer State auf Kartenebene wuerde den Fehler des einen Buendels
 * unter dem falschen anzeigen, sobald mehrere in derselben Karte stehen.
 */
function BuendelZeile({ caseId, buendel }: { caseId: string; buendel: BuendelView }) {
  const [state, zusammenfuegen] = useActionState<BuendelZusammenfuegenState, FormData>(
    buendelZusammenfuegenAction,
    {}
  );
  // Gegenpruef-Vorschau erst auf Klick: Ein Fall kann dutzende Einzelseiten in
  // mehreren Buendeln haben - alle Bilder sofort zu laden wuerde die schwerste
  // Seite der App weiter beschweren, obwohl meist nur EIN Buendel fraglich ist.
  const [vorschauOffen, setVorschauOffen] = useState(false);

  return (
    <li className="rounded-md border bg-card p-2.5">
      <p className="text-sm font-medium">
        {buendel.titel} <span className="font-normal text-muted-foreground">· {buendel.seiten.length} Seiten</span>
      </p>
      {/* Die Reihenfolge IST die Aussage - deshalb nummeriert. Bei offener
          Vorschau tragen die Vorschau-Kacheln Nummer und Name selbst - die
          Textliste zusaetzlich stehen zu lassen, hiesse alles doppelt. */}
      {!vorschauOffen && (
        <ol className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {buendel.seiten.map((s, i) => (
            <li key={`${buendel.id}-${i}`}>
              {i + 1}. {s.name}
            </li>
          ))}
        </ol>
      )}
      {vorschauOffen && (
        <ol className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {buendel.seiten.map((s, i) => (
            <li key={`${buendel.id}-vorschau-${i}`} className="min-w-0 rounded-md border bg-muted/30 p-2">
              <p className="mb-1 truncate text-xs text-muted-foreground" title={s.name}>
                {i + 1}. {s.name}
              </p>
              {s.mimeType?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/documents/${s.documentId}/download?preview=1`}
                  alt={`Seite ${i + 1}: ${s.name}`}
                  className="max-h-56 w-full rounded border bg-card object-contain"
                />
              ) : s.mimeType === "application/pdf" ? (
                <iframe
                  src={`/api/documents/${s.documentId}/download?preview=1`}
                  title={`Seite ${i + 1}: ${s.name}`}
                  className="h-56 w-full rounded border bg-card"
                />
              ) : (
                <div className="flex h-24 items-center justify-center rounded border-2 border-dashed bg-card">
                  <FileText className="h-6 w-6 text-muted-foreground/60" aria-hidden />
                </div>
              )}
              <a
                href={`/api/documents/${s.documentId}/download?preview=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline"
              >
                <ExternalLink className="h-3 w-3" aria-hidden /> In voller Größe öffnen
              </a>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {/* Gegenpruefen VOR Zusammenfuegen/Verwerfen: "IMG_1234.jpg" sagt
            nichts darueber, ob die Seite wirklich hierher gehoert - erst der
            Blick auf die Seite selbst macht die Entscheidung moeglich. */}
        <Button type="button" size="sm" variant="outline" onClick={() => setVorschauOffen((o) => !o)}>
          {vorschauOffen ? (
            <>
              <EyeOff className="h-3.5 w-3.5" aria-hidden /> Vorschau schließen
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" aria-hidden /> Seiten ansehen
            </>
          )}
        </Button>
        <form action={zusammenfuegen}>
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="buendelId" value={buendel.id} />
          <SubmitButton size="sm" pendingLabel="Wird zusammengefügt …">
            Zusammenfügen
          </SubmitButton>
        </form>
        <form action={buendelVerwerfenAction}>
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="buendelId" value={buendel.id} />
          <SubmitButton size="sm" variant="ghost">
            Verwerfen
          </SubmitButton>
        </form>
      </div>
      {/* Ein fehlgeschlagenes Zusammenfuegen muss HIER stehen, direkt unter dem
          Buendel, das es betrifft - sonst weiss der Vermittler bei mehreren
          Buendeln in einer Karte nicht, welches gemeint ist. */}
      {state.grund && (
        <p className="mt-1.5 text-xs text-destructive" role="alert">
          {state.grund}
        </p>
      )}
    </li>
  );
}
