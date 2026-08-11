"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { anforderungenAbrufen, auswahlLaden } from "@/lib/actions/anforderungen";

type Ergebnis = Awaited<ReturnType<typeof auswahlLaden>>;

/**
 * Laedt die Europace-Auswahl (Antraege/Vorschlaege) erst auf Klick, nicht
 * beim Rendern der Fallseite. `auswahlLaden` ruft zwei Europace-Endpunkte mit
 * je bis zu 30 s Timeout auf – bei jedem Aufruf der Fallseite waere das ein
 * Zwangsaufruf, den der Vermittler nie angefordert hat, und sobald echte
 * Zugangsdaten stehen, blockiert das jedes Oeffnen eines Falls mit
 * hinterlegter Vorgangsnummer. Client-Komponente mit `useTransition`, weil
 * `auswahlLaden` Daten zurueckgibt (kein `"use server"`-Void-Formular) –
 * dasselbe Muster wie `europace-uebertragung.tsx`.
 */
export function BankAnforderungenAuswahl({ caseId }: { caseId: string }) {
  const [laeuft, starte] = useTransition();
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);

  const laden = () =>
    starte(async () => {
      try {
        setErgebnis(await auswahlLaden(caseId));
      } catch {
        setErgebnis({ fehler: "Unerwarteter Fehler beim Laden der Europace-Auswahl." });
      }
    });

  const hatFehler = ergebnis && "fehler" in ergebnis && ergebnis.fehler;

  return (
    <div className="space-y-2">
      {hatFehler && (
        <>
          <p className="text-sm text-muted-foreground">{ergebnis.fehler}</p>
          <Button onClick={laden} disabled={laeuft} size="sm" variant="outline">
            <Download />
            {laeuft ? "Lädt …" : "Erneut versuchen"}
          </Button>
        </>
      )}

      {!ergebnis && (
        <Button onClick={laden} disabled={laeuft} size="sm" variant="outline">
          <Download />
          {laeuft ? "Lädt …" : "Angebote aus Europace laden"}
        </Button>
      )}

      {ergebnis && "auswahl" in ergebnis && ergebnis.auswahl && ergebnis.auswahl.length > 0 ? (
        <div className="space-y-2">
          {ergebnis.auswahl.map((a) => (
            <form
              key={`${a.quelle}-${a.bezugsId}`}
              action={anforderungenAbrufen}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <input type="hidden" name="caseId" value={caseId} />
              <input type="hidden" name="quelle" value={a.quelle} />
              <input type="hidden" name="bezugsId" value={a.bezugsId} />
              <input type="hidden" name="bankId" value={a.bankId ?? ""} />
              <input type="hidden" name="bankName" value={a.bankName} />
              <div className="text-sm">
                <p className="font-medium">{a.bankName}</p>
                <p className="text-muted-foreground">
                  {a.quelle === "antrag" ? "Antrag" : "Vorschlag"} {a.bezugsId}
                  {a.hinweis ? ` · ${a.hinweis}` : ""}
                </p>
              </div>
              <SubmitButton size="sm" className="shrink-0" pendingLabel="Schärft …">
                Liste schärfen
              </SubmitButton>
            </form>
          ))}
        </div>
      ) : null}

      {ergebnis && "auswahl" in ergebnis && ergebnis.auswahl && ergebnis.auswahl.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Europace nennt zu diesem Vorgang weder Anträge noch Finanzierungsvorschläge.
        </p>
      ) : null}
    </div>
  );
}
