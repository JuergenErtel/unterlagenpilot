"use client";

import { useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { speichereGespraechsfeld } from "@/lib/actions/erstgespraech";
import type { MaskenFeld } from "@/lib/erstgespraech/maske";

/**
 * Ein Feld des Erstgespraechs – gespeichert wird beim VERLASSEN des Feldes.
 *
 * Warum feldweise und nicht mit einem Knopf am Ende: Das Gespraech kann
 * jederzeit abbrechen ("ich rufe gleich zurueck"), und dann muss stehen, was
 * bis dahin gesagt wurde. Ein Sammelspeichern waere ausserdem eine eigene
 * Transaktion je Feld in einem Rutsch (siehe erstgespraech.ts).
 *
 * KEINE Validierung, KEIN Pflichtfeld: Ein leeres Feld ist eine gueltige
 * Angabe und loescht den Wert. Unlesbares wird nicht abgewiesen, sondern vom
 * Schreibkern zu null – der Vermittler soll nicht gegen ein Formular kaempfen,
 * waehrend er telefoniert.
 */
type Stand = "ruhe" | "speichert" | "gespeichert" | "fehler";

export function GespraechsFeld({
  caseId,
  feld,
  gesperrt = false,
}: {
  caseId: string;
  feld: MaskenFeld;
  gesperrt?: boolean;
}) {
  const [stand, setStand] = useState<Stand>("ruhe");
  const [meldung, setMeldung] = useState<string | null>(null);
  // Der zuletzt gespeicherte Wert. Nur wenn sich etwas geaendert hat, geht ein
  // Schreibvorgang raus – sonst schriebe jedes Durchtabben die ganze Maske neu.
  const gespeichert = useRef(feld.wert);

  async function sichere(roh: string) {
    if (gesperrt || roh === gespeichert.current) return;
    setStand("speichert");
    setMeldung(null);
    try {
      const ergebnis = await speichereGespraechsfeld(
        caseId,
        { entitaet: feld.ziel.entitaet, feld: feld.ziel.feld, person: feld.person },
        roh
      );
      if (ergebnis.gespeichert) {
        gespeichert.current = roh;
        setStand("gespeichert");
      } else {
        setStand("fehler");
        setMeldung(ergebnis.hinweis ?? "Nicht gespeichert.");
      }
    } catch {
      setStand("fehler");
      setMeldung("Nicht gespeichert – bitte noch einmal versuchen.");
    }
  }

  const istAuswahl = feld.typ === "auswahl" || feld.typ === "ja_nein";
  const optionen =
    feld.typ === "ja_nein"
      ? [
          { wert: "ja", label: "Ja" },
          { wert: "nein", label: "Nein" },
        ]
      : (feld.optionen ?? []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={feld.schluessel}>{feld.label}</Label>
        <Vermerk stand={stand} />
      </div>

      {istAuswahl ? (
        <select
          id={feld.schluessel}
          defaultValue={feld.wert}
          disabled={gesperrt}
          className="feld h-9 py-1"
          // Bei einer Auswahl ist die Aenderung schon die fertige Entscheidung;
          // ein zusaetzliches onBlur wuerde denselben Wert ein zweites Mal
          // schreiben, solange der erste Schreibvorgang noch laeuft.
          onChange={(e) => void sichere(e.currentTarget.value)}
        >
          <option value="">– keine Angabe –</option>
          {optionen.map((o) => (
            <option key={o.wert} value={o.wert}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={feld.schluessel}
          type={feld.typ === "datum" ? "date" : "text"}
          inputMode={
            feld.typ === "betrag" || feld.typ === "zahl" || feld.typ === "prozent_oder_betrag"
              ? "decimal"
              : undefined
          }
          defaultValue={feld.wert}
          disabled={gesperrt}
          onBlur={(e) => void sichere(e.currentTarget.value)}
        />
      )}

      {feld.hinweis && <p className="text-xs text-muted-foreground">{feld.hinweis}</p>}
      {meldung && <p className="text-xs text-destructive">{meldung}</p>}
    </div>
  );
}

function Vermerk({ stand }: { stand: Stand }) {
  if (stand === "speichert") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        speichert …
      </span>
    );
  }
  if (stand === "gespeichert") {
    return (
      <span className="flex items-center gap-1 text-xs text-success">
        <Check className="h-3 w-3" aria-hidden />
        gespeichert
      </span>
    );
  }
  return null;
}
