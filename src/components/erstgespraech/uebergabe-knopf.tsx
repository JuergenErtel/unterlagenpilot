"use client";

import { useState, useTransition } from "react";
import { Send, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { europaceVorgangAnlegen } from "@/lib/actions/cases";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Datenkontext } from "@/lib/platforms/europace/types";

/**
 * Der Knopf "An Europace übertragen" – bindende Zusage: immer bedienbar, auch
 * bei Lücken. Einzige zulässige Sperren sind ein fehlender Europace-Zugang
 * (`konfiguriert`) und die fehlende manuelle Freigabe (`freigegeben`); Lücken
 * in den Angaben werden nur GEMELDET, nie erzwungen.
 *
 * Fund A3 (Schlusspruefung 12.08.2026): Dieser zweite Einstieg in dieselbe
 * Server-Action rief `europaceVorgangAnlegen` bisher OHNE die drei Dinge auf,
 * die der aeltere Einstieg (`case/europace-uebertragung.tsx`) schon zeigt:
 * Testmodus-Abzeichen, Freigabestatus und die Freigabe-Sperre. Ohne sie stand
 * `getDatenkontext()` unsichtbar auf TEST_MODUS, der Vermittler bekam
 * "Übertragen" gemeldet und suchte den Vorgang danach vergeblich im
 * Echtbestand. Die Freigabe-Sperre widerspricht der bindenden Zusage NICHT:
 * sie ist ausdruecklich die eine bleibende Ausnahme ("keine Uebertragung ohne
 * manuelle Freigabe" – eine Zusage an den Kunden), kein Vollstaendigkeitsgatter
 * fuer die Angaben selbst. Als Nebeneffekt verhindert die Sperre auch, dass
 * ein im Telefonat probeweise geklickter Knopf bei jedem Versuch einen
 * "uebersprungen"-Eintrag im PlatformSyncLog anhaeuft (`pruefeEuropaceFreigabe`
 * in actions/cases.ts) – die Aktion wird schlicht nicht mehr aufgerufen,
 * solange nicht freigegeben ist.
 *
 * Ruft dieselbe Server-Action wie der Einreichungsassistent
 * (`/cases/[id]/export`) auf – EIN Uebertragungsweg statt einer zweiten,
 * abweichenden Implementierung.
 */
export function UebergabeKnopf({
  caseId,
  konfiguriert,
  offeneAngaben,
  freigegeben,
  datenkontext,
}: {
  caseId: string;
  konfiguriert: boolean;
  offeneAngaben: number;
  freigegeben: boolean;
  datenkontext: Datenkontext;
}) {
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [feldmeldungen, setFeldmeldungen] = useState<string[]>([]);
  const [erfolg, setErfolg] = useState(false);

  const uebertragen = () =>
    starte(async () => {
      try {
        const ergebnis = await europaceVorgangAnlegen(caseId);
        setMeldung(ergebnis.meldung);
        // Genau im erwarteten Fall (Vorgang unvollstaendig, Europace lehnt ab)
        // liegen hier die feldgenauen Gruende – ohne sie sieht der Vermittler
        // nur "Europace hat die Daten abgelehnt", ohne zu erfahren, woran.
        // Bei einem parallelen zweiten Aufruf entsteht zusaetzlich ein
        // ueberzaehliger Vorgang in Europace; die Nummer MUSS sichtbar werden,
        // sonst bleibt er dort unbemerkt liegen (gleiches Vorgehen wie im
        // Einreichungsassistenten, siehe europace-uebertragung.tsx).
        setFeldmeldungen(
          ergebnis.verwaisteVorgangsnummer
            ? [
                `Achtung: In Europace ist zusätzlich der Vorgang ${ergebnis.verwaisteVorgangsnummer} entstanden. Bitte dort prüfen und entfernen.`,
                ...(ergebnis.feldmeldungen ?? []),
              ]
            : (ergebnis.feldmeldungen ?? [])
        );
        setErfolg(ergebnis.ok);
      } catch {
        setMeldung("Unerwarteter Fehler bei der Übertragung. Bitte erneut versuchen oder die Seite neu laden.");
        setFeldmeldungen([]);
        setErfolg(false);
      }
    });

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={uebertragen} disabled={!konfiguriert || !freigegeben || laeuft}>
          <Send />
          {laeuft ? "Überträgt…" : "An Europace übertragen"}
        </Button>
        {datenkontext === "TEST_MODUS" && konfiguriert && (
          <Badge variant="outline">Testmodus – keine echten Vorgänge</Badge>
        )}
      </div>

      {!konfiguriert && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Europace-Zugang fehlt noch — Werte bis dahin von Hand übertragen.
        </p>
      )}

      {konfiguriert && !freigegeben && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Der Fall muss zuerst im Einreichungsassistenten für Europace freigegeben werden.
        </p>
      )}

      {konfiguriert && freigegeben && offeneAngaben > 0 && (
        <p className="text-sm text-muted-foreground">
          {offeneAngaben} Angabe{offeneAngaben === 1 ? "" : "n"} fehl{offeneAngaben === 1 ? "t" : "en"} — in
          Europace nachtragen.
        </p>
      )}

      {meldung && (
        <div className="rounded-lg border p-3 text-sm">
          <p className="flex items-start gap-2">
            {erfolg ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            )}
            {meldung}
          </p>
          {feldmeldungen.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-6 text-muted-foreground">
              {feldmeldungen.map((f, i) => (
                // Index als Teil des Schluessels: Der Meldungstext allein ist
                // nicht eindeutig (z. B. zwei gleiche Feldnamen-Hinweise).
                <li key={`${i}-${f}`}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
