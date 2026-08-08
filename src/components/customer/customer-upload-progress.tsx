import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fortschrittHinweis } from "@/lib/upload/kundenansicht";

/**
 * Kundenseitiger Fortschritt – freundlich, mobil.
 *
 * Zwei Anteile im Balken, weil "angenommen" allein den Kunden bestraft: Wer
 * abends alle zwoelf Unterlagen hochlaedt, sah bis zur Pruefung 0 von 12 und
 * 0 % – und darunter die Aufforderung, endlich hochzuladen. Der hellere
 * Anteil zeigt, was bei uns liegt und noch geprueft wird.
 */
export function CustomerUploadProgress({
  angenommen,
  eingereicht,
  gesamt,
}: {
  angenommen: number;
  eingereicht: number;
  gesamt: number;
}) {
  const pct = gesamt === 0 ? 100 : Math.round((angenommen / gesamt) * 100);
  const pctEingereicht = gesamt === 0 ? 100 : Math.round((eingereicht / gesamt) * 100);
  const allesAngenommen = gesamt > 0 && angenommen === gesamt;
  const allesEingereicht = gesamt > 0 && eingereicht === gesamt;
  const inPruefung = Math.max(eingereicht - angenommen, 0);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className={cn("h-5 w-5", allesAngenommen ? "text-success" : "text-ai")} />
          <span className="text-sm font-medium">
            <strong>
              {angenommen} von {gesamt} Unterlagen angenommen
            </strong>
          </span>
        </div>
        <span className="font-mono text-sm font-semibold tabular text-foreground">{pct}%</span>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all", allesAngenommen ? "bg-success" : "bg-success/80")}
          style={{ width: `${pct}%` }}
        />
        {/* Hellerer Anteil: eingegangen, aber noch nicht geprueft. */}
        <div
          className="h-full bg-ai/40 transition-all"
          style={{ width: `${Math.max(pctEingereicht - pct, 0)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {fortschrittHinweis({ erledigt: angenommen, eingereicht, gesamt })}
      </p>
      {/* Bei "alles eingegangen" sagt der Satz oben schon alles. */}
      {inPruefung > 0 && !allesAngenommen && !allesEingereicht && (
        <p className="mt-1 text-xs text-muted-foreground">
          {inPruefung === 1
            ? "1 weitere Unterlage ist bei uns eingegangen und wird geprüft."
            : `${inPruefung} weitere Unterlagen sind bei uns eingegangen und werden geprüft.`}
        </p>
      )}
    </div>
  );
}
