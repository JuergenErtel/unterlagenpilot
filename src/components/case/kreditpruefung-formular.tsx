"use client";

import { useEffect, useState, useTransition } from "react";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ladeKreditpruefung, speichereKreditpruefung } from "@/lib/actions/kreditpruefung";
import type { KreditpruefungStand } from "@/lib/cases/kreditpruefung";

/**
 * Die fuenf Angaben zur eingereichten Kreditpruefung: bei welcher Bank, welche
 * Summe, welcher Zins, welche Bindung, welche Rate oder welcher Tilgungssatz.
 *
 * Wird an zwei Stellen geoeffnet: beim Zug einer Karte ins Kanban-Feld
 * "Kreditpruefung eingereicht" und in der Fallakte zum Nachtragen/Aendern.
 * Beide Wege fuehren auf dasselbe Formular, damit es nur EINE Wahrheit gibt.
 *
 * Nichts ist Pflicht. Der Phasenwechsel ist da schon passiert – ein Formular,
 * das ihn zurueckhielte, wuerde umgangen statt ausgefuellt. Was fehlt, zeigt
 * die Fallakte danach als Luecke an.
 */
export function KreditpruefungFormular({
  caseId,
  offen,
  onClose,
}: {
  caseId: string;
  offen: boolean;
  onClose: () => void;
}) {
  const [stand, setStand] = useState<KreditpruefungStand | null>(null);
  const [vorschlag, setVorschlag] = useState<{
    bank: string | null;
    darlehenssumme: number | null;
    zinsbindungJahre: number | null;
    rateMonatlich: number | null;
  } | null>(null);
  const [geladen, setGeladen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Erst beim Oeffnen laden: Die Kanban-Karte weiss nichts von Wunschwerten,
  // und alle Faelle vorzuladen waere eine Datenbankrunde je Karte.
  useEffect(() => {
    if (!offen || geladen) return;
    let abgebrochen = false;
    void ladeKreditpruefung(caseId).then((r) => {
      if (abgebrochen) return;
      setStand(r.stand);
      setVorschlag(r.vorschlag);
      setGeladen(true);
    });
    return () => {
      abgebrochen = true;
    };
  }, [offen, geladen, caseId]);

  if (!offen) return null;

  const heute = new Date().toISOString().slice(0, 10);
  // Vorbelegung: gespeicherter Wert schlaegt Wunschwert schlaegt leer. Der
  // Wunschwert ist ausdruecklich nur ein Vorschlag – gespeichert wird, was
  // hier steht, wenn der Vermittler "Speichern" drueckt.
  const v = (
    gespeichert: string | number | null | undefined,
    wunsch?: string | number | null
  ): string => (gespeichert ?? wunsch ?? "").toString().replace(".", ",");

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Zur Kreditprüfung eingereicht"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border bg-card p-5 shadow-lg">
        <div className="mb-1 flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Zur Kreditprüfung eingereicht</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Womit ist der Fall rausgegangen? Nichts davon ist Pflicht – was du jetzt nicht weißt,
          trägst du später in der Fallakte nach.
        </p>

        {!geladen ? (
          <p className="py-8 text-center text-sm text-muted-foreground">wird geladen …</p>
        ) : (
          <form
            action={(fd) =>
              startTransition(async () => {
                await speichereKreditpruefung(caseId, fd);
                onClose();
              })
            }
            className="space-y-3"
          >
            <label className="block">
              <span className="text-xs text-muted-foreground">Bei welcher Bank eingereicht?</span>
              <input
                name="bank"
                defaultValue={v(stand?.bank, vorschlag?.bank)}
                placeholder="z. B. ING, Sparkasse Bochum"
                className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-muted-foreground">Darlehenssumme (€)</span>
                <input
                  name="darlehenssumme"
                  inputMode="decimal"
                  defaultValue={v(stand?.darlehenssumme, vorschlag?.darlehenssumme)}
                  placeholder="320.000"
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm tabular"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">Sollzins (%)</span>
                <input
                  name="sollzinsProzent"
                  inputMode="decimal"
                  defaultValue={v(stand?.sollzinsProzent)}
                  placeholder="3,45"
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm tabular"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">Zinsbindung (Jahre)</span>
                <input
                  name="zinsbindungJahre"
                  inputMode="numeric"
                  defaultValue={v(stand?.zinsbindungJahre, vorschlag?.zinsbindungJahre)}
                  placeholder="10"
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm tabular"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">Eingereicht am</span>
                <input
                  type="date"
                  name="eingereichtAm"
                  defaultValue={stand?.eingereichtAm ?? heute}
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm"
                />
              </label>
            </div>

            {/* Rate ODER Tilgung: je nach Bank liegt das eine oder das andere
                vor. Beides zu verlangen hiesse, eine Zahl zu erfinden. */}
            <fieldset className="rounded-md border p-3">
              <legend className="px-1 text-xs text-muted-foreground">
                Monatliche Rate oder Tilgungssatz – eines von beiden genügt
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-muted-foreground">Rate (€/Monat)</span>
                  <input
                    name="rateMonatlich"
                    inputMode="decimal"
                    defaultValue={v(stand?.rateMonatlich, vorschlag?.rateMonatlich)}
                    placeholder="1.480"
                    className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm tabular"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground">Tilgung (% p. a.)</span>
                  <input
                    name="tilgungProzent"
                    inputMode="decimal"
                    defaultValue={v(stand?.tilgungProzent)}
                    placeholder="2,0"
                    className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm tabular"
                  />
                </label>
              </div>
            </fieldset>

            <label className="block">
              <span className="text-xs text-muted-foreground">Eingereicht über (Plattform)</span>
              <input
                name="plattform"
                defaultValue={v(stand?.plattform)}
                placeholder="Europace, FinLink, eHyp home oder direkt"
                className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs text-muted-foreground">Notiz (freiwillig)</span>
              <textarea
                name="notiz"
                rows={2}
                defaultValue={stand?.notiz ?? ""}
                placeholder="z. B. Sachbearbeiterin Frau Meier, Rückmeldung bis Freitag"
                className="mt-0.5 w-full rounded-md border bg-background p-2 text-sm"
              />
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
                Später
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Wird gespeichert …" : "Speichern"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
