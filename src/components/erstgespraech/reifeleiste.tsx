import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Reife } from "@/lib/erstgespraech/reife";
import { GefuehrtHaken } from "@/components/erstgespraech/gefuehrt-haken";

/**
 * Wie weit die Angaben fuer ein Angebot tragen.
 *
 * Eine Auskunft, kein Tor: Die Leiste zaehlt mit, sie sperrt nichts. Kein Feld
 * ist Pflicht, und "An Europace uebertragen" bleibt auch bei 3 von 26 Angaben
 * bedienbar. Deshalb steht hier auch kein rotes "unvollstaendig" – nur die
 * Zahl der offenen Angaben und, wenn nichts mehr fehlt, die Entwarnung.
 */
export function Reifeleiste({
  reife,
  caseId,
  gefuehrt,
  gesperrt,
}: {
  reife: Reife;
  caseId: string;
  gefuehrt: boolean;
  gesperrt: boolean;
}) {
  const offen = reife.gesamt - reife.gefuellt;
  const prozent = reife.gesamt === 0 ? 100 : Math.round((reife.gefuellt / reife.gesamt) * 100);
  const fertig = offen === 0;

  return (
    <Card className={fertig ? "border-success/40" : undefined}>
      <CardContent className="space-y-2 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="display text-[1.05rem]">
            {fertig
              ? "Alle Angaben für ein Angebot stehen."
              : `Noch ${offen} ${offen === 1 ? "Angabe" : "Angaben"} bis zum Angebot`}
          </span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {reife.gefuellt} von {reife.gesamt}
          </span>
        </div>
        <Progress
          value={prozent}
          indicatorClassName={fertig ? "bg-success" : "bg-primary"}
          aria-label={`${reife.gefuellt} von ${reife.gesamt} angebotsrelevanten Angaben erfasst`}
        />
        <p className="text-xs text-muted-foreground">
          Die Leiste zählt mit, sie hält nichts auf: Jedes Feld darf leer bleiben, jede Angabe
          lässt sich nachtragen.
        </p>
        {/* Der Haken gehört hierher, nicht ans Seitenende: Er ist die Antwort auf
            genau die Zahl darüber – "die offenen Angaben kenne ich, das Gespräch
            ist trotzdem geführt". */}
        <GefuehrtHaken caseId={caseId} gefuehrt={gefuehrt} gesperrt={gesperrt} />
      </CardContent>
    </Card>
  );
}
