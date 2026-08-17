"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { markiereErstgespraechGefuehrt } from "@/lib/actions/erstgespraech";
import { Button } from "@/components/ui/button";

/**
 * "Gespräch geführt" – der Haken, der die Fallreise weiterlaufen lässt.
 *
 * Die Reifeleiste zählt rund 35 Angaben, von denen etliche zu Recht leer
 * bleiben: keine weiteren Einkünfte, kein Konditionswunsch, keine zweite
 * Staatsangehörigkeit. Weil die Fallreise bauartbedingt nur EINEN Schritt
 * zeigt, blieb sie ohne diesen Haken für immer auf "Erstgespräch führen" stehen
 * und verdeckte Machbarkeit, Unterlagen, Fristen und Einreichung – auch bei
 * einem Fall, dessen Dokumente längst alle freigegeben waren.
 *
 * Bewusst ein Haken und keine Schwelle: Ob das Gespräch geführt ist, weiß der
 * Vermittler, nicht eine Zahl. Er schließt nichts ab – die Maske bleibt offen
 * und über den Dauer-Einstieg in der Werkzeugspalte der Fallseite jederzeit
 * erreichbar ("Erstgespräch führen · N offen") – und er lässt sich jederzeit
 * wieder lösen.
 *
 * Was er sehr wohl tut: die Fallreise vollständig zum Schweigen bringen. Bis
 * zum 17.08.2026 blieben die offenen Angaben nach dem Abhaken als wartender
 * Schritt stehen; für Jürgen las sich das so, als hätte der Haken nichts
 * bewirkt ("abgehakt – steht aber immer noch als ToDo im Fall"). Wer abhakt,
 * hat abgehakt.
 */
export function GefuehrtHaken({
  caseId,
  gefuehrt,
  gesperrt,
}: {
  caseId: string;
  gefuehrt: boolean;
  gesperrt: boolean;
}) {
  const [laeuft, starte] = useTransition();
  const [hinweis, setHinweis] = useState<string | null>(null);

  const umschalten = () =>
    starte(async () => {
      setHinweis(null);
      const ergebnis = await markiereErstgespraechGefuehrt(caseId, !gefuehrt);
      if (!ergebnis.gespeichert) setHinweis(ergebnis.hinweis ?? "Konnte nicht gespeichert werden.");
    });

  if (gesperrt) return null;

  return (
    <div className="space-y-1.5">
      {gefuehrt ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            Als geführt abgehakt – die Fallreise geht weiter.
          </span>
          <Button variant="ghost" size="sm" onClick={umschalten} disabled={laeuft}>
            <RotateCcw />
            {laeuft ? "…" : "Haken lösen"}
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={umschalten} disabled={laeuft}>
          <CheckCircle2 />
          {laeuft ? "Wird gespeichert …" : "Gespräch geführt"}
        </Button>
      )}
      {hinweis && <p className="text-xs text-warning">{hinweis}</p>}
    </div>
  );
}
