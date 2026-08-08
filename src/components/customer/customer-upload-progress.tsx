import { Pruefleiste, PruefleisteLegende, type PruefSegment } from "@/components/ui/pruefleiste";
import { fortschrittHinweis } from "@/lib/upload/kundenansicht";

/**
 * Der Stand der Akte, wie der Kunde ihn sieht.
 *
 * Statt eines Fortschrittsbalkens die Pruefleiste: Sie zeigt nicht nur "wie
 * weit", sondern je Unterlage, was los ist. Das ist fuer den Kunden der
 * Unterschied zwischen "es fehlt noch etwas" und "bei genau dieser einen
 * Unterlage muss ich noch einmal ran".
 *
 * Die Legende steht hier – und nur hier. Der Kunde sieht das Instrument
 * einmalig, der Vermittler taeglich; im taeglichen Gebrauch waere sie Ballast.
 */
export function CustomerUploadProgress({
  angenommen,
  eingereicht,
  gesamt,
  segmente,
}: {
  angenommen: number;
  eingereicht: number;
  gesamt: number;
  segmente: PruefSegment[];
}) {
  const pct = gesamt === 0 ? 100 : Math.round((angenommen / gesamt) * 100);

  return (
    <section className="rounded-lg border bg-card p-5 card-elevated">
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow">Stand Ihrer Unterlagen</p>
        <p className="display text-2xl tabular leading-none">
          {pct}
          <span className="text-base text-muted-foreground">%</span>
        </p>
      </div>

      <p className="mt-1 text-sm font-medium">
        {angenommen} von {gesamt} {gesamt === 1 ? "Unterlage" : "Unterlagen"} angenommen
      </p>

      <Pruefleiste segmente={segmente} groesse="lg" className="mt-4" />

      <p className="mt-3 text-sm text-muted-foreground">
        {fortschrittHinweis({ erledigt: angenommen, eingereicht, gesamt })}
      </p>

      <PruefleisteLegende className="mt-4 border-t pt-3" />
    </section>
  );
}
