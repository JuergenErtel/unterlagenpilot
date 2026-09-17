"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/domain/enums";
import {
  buendelZusammenfuegenAction,
  buendelVerwerfenAction,
  seitenZusammenfuegenAction,
} from "@/lib/actions/buendelung";
import { seiteErledigtAction } from "@/lib/actions/sortierer";
import type { Frage } from "@/lib/sortierer/fragen";

/**
 * Die geführte Durchsicht des Sortierers: eine Frage, eine Antwort, weiter.
 *
 * Bewusst genau EINE Frage auf dem Bildschirm, nicht eine Liste mit
 * Häkchen. Eine Liste sieht nach weniger Arbeit aus, verlangt aber, dass der
 * Berater sich für jede Zeile selbst überlegt, worum es geht - und dabei
 * gehen die unsicheren Fälle unter, also genau die, wegen derer gefragt wird.
 *
 * Nichts wird zugeordnet, bevor der Berater geantwortet hat. Das ist die
 * Zusage des Produkts, nicht eine Einstellung.
 */
export function StapelFragen({
  stapelId,
  frage,
  offen,
  gesamt,
}: {
  stapelId: string;
  frage: Frage;
  /** Wie viele Fragen noch offen sind (inklusive dieser). */
  offen: number;
  /** Wie viele es insgesamt waren - fuer "Frage 3 von 7". */
  gesamt: number;
}) {
  const router = useRouter();
  const [warte, starte] = useTransition();
  const [zusammen, fuegeZusammen, fuegtZusammen] = useActionState(buendelZusammenfuegenAction, {});
  const [seiten, fuegeSeitenZusammen, fuegtSeitenZusammen] = useActionState(
    seitenZusammenfuegenAction,
    {}
  );
  const laeuft = warte || fuegtZusammen || fuegtSeitenZusammen;
  const nummer = gesamt - offen + 1;

  return (
    <section className="flaeche-oben space-y-4 rounded-lg p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">Kurze Rückfrage</h2>
        <span className="font-mono text-xs text-muted-foreground tabular">
          {nummer} von {gesamt}
        </span>
      </div>

      {frage.art === "buendel" ? (
        <>
          <p className="t-abschnitt">
            Diese {frage.seiten.length} Seiten sehe ich als <strong>ein</strong> Dokument:{" "}
            {frage.titel}. Stimmt das?
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {frage.seiten.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`/api/documents/${s.id}/download?preview=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flaeche-ablage flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent/60"
                >
                  <span className="font-mono text-xs text-muted-foreground tabular">{i + 1}.</span>
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{s.name}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="t-hilfe text-xs">
            Zum Ansehen auf eine Seite klicken – sie öffnet sich in einem neuen Tab.
          </p>

          <div className="flex flex-wrap gap-2">
            <form action={fuegeZusammen}>
              <input type="hidden" name="caseId" value={stapelId} />
              <input type="hidden" name="buendelId" value={frage.buendelId} />
              <Button type="submit" disabled={laeuft}>
                {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Ja, zu einem PDF zusammenfügen
              </Button>
            </form>
            <form action={buendelVerwerfenAction}>
              <input type="hidden" name="caseId" value={stapelId} />
              <input type="hidden" name="buendelId" value={frage.buendelId} />
              <Button type="submit" variant="outline" disabled={laeuft}>
                <X className="h-4 w-4" />
                Nein, einzeln lassen
              </Button>
            </form>
          </div>
          {zusammen.grund && <p className="text-sm text-destructive">{zusammen.grund}</p>}
        </>
      ) : (
        <>
          <p className="t-abschnitt">Wohin gehört diese Seite?</p>
          <a
            href={`/api/documents/${frage.documentId}/download?preview=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="flaeche-ablage flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent/60"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{frage.name}</span>
          </a>
          {frage.vermutung && (
            /* Die Vermutung wird GEZEIGT, nicht gesetzt: Sie kam ohne
               lesbaren Text zustande und ist damit geraten. */
            <p className="t-hilfe text-xs">
              Vermutung der Erkennung: {DOCUMENT_TYPE_LABELS[frage.vermutung as DocumentType]} – aber
              ohne lesbaren Text, deshalb frage ich.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {frage.ziele.map((z) => (
              <form key={z.id} action={fuegeSeitenZusammen}>
                <input type="hidden" name="caseId" value={stapelId} />
                <input type="hidden" name="documentIds" value={`${z.id},${frage.documentId}`} />
                <Button type="submit" variant="outline" disabled={laeuft}>
                  Zu „{z.titel}“
                </Button>
              </form>
            ))}
            <Button
              disabled={laeuft}
              onClick={() =>
                starte(async () => {
                  await seiteErledigtAction(stapelId, frage.documentId);
                  router.refresh();
                })
              }
            >
              {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Eigenes Dokument
            </Button>
          </div>
          {seiten.grund && <p className="text-sm text-destructive">{seiten.grund}</p>}
          <p className="t-hilfe text-xs">
            „Eigenes Dokument“ heißt auch: Wenn du damit nichts anfangen kannst, kommt die
            Seite als eigene Datei mit zurück – verloren geht nichts.
          </p>
        </>
      )}
    </section>
  );
}
