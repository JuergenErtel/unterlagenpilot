"use client";

import { useState, useTransition } from "react";
import { Send, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { europaceVorgangAnlegen } from "@/lib/actions/cases";
import { Button } from "@/components/ui/button";

/**
 * Der Knopf "An Europace übertragen" – bindende Zusage: immer bedienbar, auch
 * bei Lücken. Einzige Ausnahme ist ein fehlender Europace-Zugang
 * (`konfiguriert`); Lücken werden nur GEMELDET, nie erzwungen. Die manuelle
 * Freigabe (`pruefeEuropaceFreigabe` in actions/cases.ts) bleibt bestehen –
 * fehlt sie, meldet der Klick das als Ergebnis statt den Knopf vorher zu
 * sperren, denn sie ist eine Zusage an den Kunden, kein Vollständigkeitsgatter.
 *
 * Ruft dieselbe Server-Action wie der Einreichungsassistent
 * (`/cases/[id]/export`) auf – EIN Uebertragungsweg statt einer zweiten,
 * abweichenden Implementierung.
 */
export function UebergabeKnopf({
  caseId,
  konfiguriert,
  offeneAngaben,
}: {
  caseId: string;
  konfiguriert: boolean;
  offeneAngaben: number;
}) {
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState(false);

  const uebertragen = () =>
    starte(async () => {
      try {
        const ergebnis = await europaceVorgangAnlegen(caseId);
        setMeldung(ergebnis.meldung);
        setErfolg(ergebnis.ok);
      } catch {
        setMeldung("Unerwarteter Fehler bei der Übertragung. Bitte erneut versuchen oder die Seite neu laden.");
        setErfolg(false);
      }
    });

  return (
    <div className="space-y-2 border-t pt-4">
      <Button onClick={uebertragen} disabled={!konfiguriert || laeuft}>
        <Send />
        {laeuft ? "Überträgt…" : "An Europace übertragen"}
      </Button>

      {!konfiguriert && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Europace-Zugang fehlt noch — Werte bis dahin von Hand übertragen.
        </p>
      )}

      {konfiguriert && offeneAngaben > 0 && (
        <p className="text-sm text-muted-foreground">
          {offeneAngaben} Angabe{offeneAngaben === 1 ? "" : "n"} fehl{offeneAngaben === 1 ? "t" : "en"} — in
          Europace nachtragen.
        </p>
      )}

      {meldung && (
        <p className="flex items-start gap-2 text-sm">
          {erfolg ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          )}
          {meldung}
        </p>
      )}
    </div>
  );
}
