"use client";

import { useActionState } from "react";
import { Layers } from "lucide-react";
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
  seiten: Array<{ name: string }>;
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
}: {
  caseId: string;
  status: "ausstehend" | "laeuft" | "fertig" | "fehler";
  buendel: BuendelView[];
}) {
  // "Noch nicht geprueft" bekommt keine Karte - sonst stuende dort dauerhaft
  // ein Hinweis, der nichts sagt.
  if (status === "ausstehend") return null;

  const erneutPruefen = (
    <form action={buendelErneutPruefenAction}>
      <input type="hidden" name="caseId" value={caseId} />
      <SubmitButton size="sm" variant="ghost" pendingLabel="Wird geprüft …">
        Erneut prüfen
      </SubmitButton>
    </form>
  );

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

  return (
    <li className="rounded-md border bg-card p-2.5">
      <p className="text-sm font-medium">
        {buendel.titel} <span className="font-normal text-muted-foreground">· {buendel.seiten.length} Seiten</span>
      </p>
      {/* Die Reihenfolge IST die Aussage - deshalb nummeriert. */}
      <ol className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {buendel.seiten.map((s, i) => (
          <li key={`${buendel.id}-${i}`}>
            {i + 1}. {s.name}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex gap-2">
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
