"use client";

import { useState, useTransition } from "react";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { uebernehmen } from "@/lib/actions/self-disclosure";

export interface VorschlagRow {
  schluessel: string;
  label: string;
  abschnitt: string;
  kundenwert: string;
  fallwert: string | null;
  art: "luecke" | "abweichung";
}

/**
 * Prüfansicht der eingegangenen Selbstauskunft.
 *
 * Lücken sind vorausgewählt – dort geht nichts verloren. Abweichungen nie: Die
 * Entscheidung über einen bereits gepflegten Wert trifft immer der Vermittler.
 */
export function SelfDisclosureInbox({
  caseId,
  vorschlaege,
  offen,
  ohneZiel,
  submittedAt,
}: {
  caseId: string;
  vorschlaege: VorschlagRow[];
  offen: Array<{ label: string; abschnitt: string }>;
  ohneZiel: Array<{ label: string; wert: string }>;
  submittedAt: string;
}) {
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(
    new Set(vorschlaege.filter((v) => v.art === "luecke").map((v) => v.schluessel))
  );
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  function toggle(schluessel: string) {
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (neu.has(schluessel)) neu.delete(schluessel);
      else neu.add(schluessel);
      return neu;
    });
  }

  const luecken = vorschlaege.filter((v) => v.art === "luecke");
  const abweichungen = vorschlaege.filter((v) => v.art === "abweichung");

  return (
    <div id="selbstauskunft-eingang" className="space-y-6 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Selbstauskunft eingegangen</h3>
          <span className="text-xs text-muted-foreground">am {submittedAt}</span>
        </div>
        <Button
          size="sm"
          disabled={pending || gewaehlt.size === 0}
          onClick={() =>
            startTransition(async () => {
              const res = await uebernehmen(caseId, [...gewaehlt]);
              setFehler(res.error ?? null);
            })
          }
        >
          {pending
            ? "Wird übernommen …"
            : `${gewaehlt.size} Angabe${gewaehlt.size === 1 ? "" : "n"} übernehmen`}
        </Button>
      </div>
      {fehler && <p className="text-sm text-destructive">{fehler}</p>}

      {luecken.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Lücken füllen ({luecken.length})</h4>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setGewaehlt(new Set(vorschlaege.map((v) => v.schluessel)))}
            >
              Alle auswählen
            </button>
          </div>
          {luecken.map((v) => (
            <label
              key={v.schluessel}
              className="flex items-center gap-3 rounded-md border p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={gewaehlt.has(v.schluessel)}
                onChange={() => toggle(v.schluessel)}
              />
              <span className="flex-1">{v.label}</span>
              <span className="font-medium">{v.kundenwert}</span>
            </label>
          ))}
        </section>
      )}

      {abweichungen.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Abweichungen ({abweichungen.length})</h4>
          <p className="text-xs text-muted-foreground">
            Hier steht schon etwas im Fall – nichts wird ohne deinen Haken überschrieben.
          </p>
          {abweichungen.map((v) => (
            <label
              key={v.schluessel}
              className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={gewaehlt.has(v.schluessel)}
                onChange={() => toggle(v.schluessel)}
              />
              <span className="flex-1">{v.label}</span>
              <span className="text-muted-foreground line-through">{v.fallwert}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{v.kundenwert}</span>
            </label>
          ))}
        </section>
      )}

      {offen.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Vom Kunden offen gelassen ({offen.length})</h4>
          <p className="text-xs text-muted-foreground">
            Der Bogen verlangt keine Angabe – das hier ist deine Nachfassliste.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {offen.map((o) => (
              <Badge key={o.label} variant="outline">
                {o.label}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {ohneZiel.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Nur zur Kenntnis</h4>
          {/* Zweierlei steht hier, seit die Übernahme bei zwei Antworten auf
              dieselbe Spalte die gerade sichtbare bevorzugt: Angaben ohne
              Speicherort UND überholte Beträge, die sehr wohl ein Feld haben.
              Der Vermittler muss beides sehen, geschrieben wird keines. */}
          <p className="text-xs text-muted-foreground">
            Angaben, die nichts in der Fallakte überschreiben: solche ohne eigenes Feld (Warmmiete,
            Unterhalt, die freien Listen) und ältere Antworten, die inzwischen von einer neueren auf
            dasselbe Feld überholt wurden – etwa eine Restschuld, nachdem der Kunde auf Kauf
            umgestellt hat.
          </p>
          <dl className="space-y-1 text-sm">
            {ohneZiel.map((o) => (
              <div key={o.label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{o.label}</dt>
                <dd className="font-medium">{o.wert}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
